import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, isValidPeriodKey, toUnixSeconds } from "@/lib/dates";


const INVOICED_STATUSES = ["Sent", "Open", "Closed"];
const ACTIVE_REAL_JOB_WHERE = `
  j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;
const EFFECTIVE_INVOICE_DATE = "COALESCE(i.date_invoice, i.jn_date_created)";

type RevenueInvoiceRow = {
  invoice_id: string;
  invoice_number: string | null;
  total: string;
  total_paid: string;
  balance: string;
  invoice_status: string;
  invoice_date: string | null;
  invoice_created_at: string | null;
  effective_invoice_date: string | null;
  job_jnid: string;
  job_name: string | null;
  job_status: string | null;
  record_type_name: string | null;
  sales_rep_name: string | null;
  source_name: string | null;
  customer_name: string | null;
  qbo_invoice_id: string | null;
  qbo_doc_number: string | null;
  qbo_amount: string | null;
  qbo_balance: string | null;
  qbo_match_status: string | null;
  qbo_match_method: string | null;
  qbo_match_confidence: string | null;
};

type BreakdownRow = {
  key: string;
  total: string;
  count: string;
};

type QboInvoiceRow = {
  invoice_id: string;
  doc_number: string | null;
  customer_name: string | null;
  amount: string;
  balance: string;
  status: string | null;
  txn_date: string | null;
  matched_jn_invoice_id: string | null;
  matched_jn_invoice_number: string | null;
};

type QboSummaryRow = {
  total_revenue: string;
  total_balance: string;
  invoice_count: string;
};

type QboStatusRow = {
  connected: boolean;
  company_name: string | null;
  last_sync_at: string | null;
  refresh_token_expires_at: string | null;
  status: string;
};

function money(value: string | null | undefined): number {
  return Math.round((parseFloat(value ?? "0") || 0) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = isValidPeriodKey(periodParam) ? periodParam : "month";
    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    const params = [startUnix, endUnix, INVOICED_STATUSES];
    const startDate = range.start.toISOString().slice(0, 10);
    const endDate = range.end.toISOString().slice(0, 10);
    const qboParams = [startDate, endDate];
    const invoiceWhere = `
      i.is_active = true
      AND ${ACTIVE_REAL_JOB_WHERE}
      AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
      AND ${EFFECTIVE_INVOICE_DATE} >= $1
      AND ${EFFECTIVE_INVOICE_DATE} < $2
    `;

    const [invoiceRows, byStatusRows, byTypeRows, byRepRows, qboStatusRows, qboSummaryRows, qboInvoiceRows] = await Promise.all([
      query<RevenueInvoiceRow>(
        `SELECT
           i.jnid::text AS invoice_id,
           i.number::text AS invoice_number,
           COALESCE(i.total, 0)::text AS total,
           COALESCE(i.total_paid, 0)::text AS total_paid,
           (COALESCE(i.total, 0) - COALESCE(i.total_paid, 0))::text AS balance,
           COALESCE(i.status_name, i.status::text, 'Unknown') AS invoice_status,
           CASE WHEN i.date_invoice IS NOT NULL THEN to_timestamp(i.date_invoice)::date::text ELSE NULL END AS invoice_date,
           CASE WHEN i.jn_date_created IS NOT NULL THEN to_timestamp(i.jn_date_created)::date::text ELSE NULL END AS invoice_created_at,
           CASE WHEN ${EFFECTIVE_INVOICE_DATE} IS NOT NULL THEN to_timestamp(${EFFECTIVE_INVOICE_DATE})::date::text ELSE NULL END AS effective_invoice_date,
           j.jnid::text AS job_jnid,
           j.name AS job_name,
           j.status_name AS job_status,
           COALESCE(j.record_type_name, 'Unknown') AS record_type_name,
           COALESCE(j.sales_rep_name, 'Unassigned') AS sales_rep_name,
           COALESCE(j.source_name, 'Unknown') AS source_name,
           COALESCE(c.display_name, j.primary_contact_name, 'Unknown') AS customer_name,
           COALESCE(qim.qbo_id, qid.qbo_id) AS qbo_invoice_id,
           COALESCE(qim.doc_number, qid.doc_number) AS qbo_doc_number,
           COALESCE(qim.total_amount, qid.total_amount)::text AS qbo_amount,
           COALESCE(qim.balance, qid.balance)::text AS qbo_balance,
           COALESCE(im.status, CASE WHEN qid.qbo_id IS NOT NULL THEN 'matched' ELSE NULL END) AS qbo_match_status,
           COALESCE(im.match_method, CASE WHEN qid.qbo_id IS NOT NULL THEN 'doc_number' ELSE NULL END) AS qbo_match_method,
           COALESCE(im.match_confidence, CASE WHEN qid.qbo_id IS NOT NULL THEN 0.95 ELSE NULL END)::text AS qbo_match_confidence
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         LEFT JOIN contacts c ON c.jnid = i.contact_jnid
         LEFT JOIN invoice_mapping im ON im.jn_invoice_id = i.jnid
         LEFT JOIN qbo_invoices qim ON qim.qbo_id = im.qbo_invoice_id
         LEFT JOIN qbo_invoices qid ON qid.doc_number = i.number::text
         WHERE ${invoiceWhere}
         ORDER BY ${EFFECTIVE_INVOICE_DATE} DESC NULLS LAST, i.total DESC`,
        params
      ),
      query<BreakdownRow>(
        `SELECT COALESCE(i.status_name, i.status::text, 'Unknown') AS key,
                COALESCE(SUM(i.total), 0)::text AS total,
                COUNT(*)::text AS count
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE ${invoiceWhere}
         GROUP BY key
         ORDER BY SUM(i.total) DESC`,
        params
      ),
      query<BreakdownRow>(
        `SELECT COALESCE(j.record_type_name, 'Unknown') AS key,
                COALESCE(SUM(i.total), 0)::text AS total,
                COUNT(*)::text AS count
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE ${invoiceWhere}
         GROUP BY key
         ORDER BY SUM(i.total) DESC`,
        params
      ),
      query<BreakdownRow>(
        `SELECT COALESCE(j.sales_rep_name, 'Unassigned') AS key,
                COALESCE(SUM(i.total), 0)::text AS total,
                COUNT(*)::text AS count
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE ${invoiceWhere}
         GROUP BY key
         ORDER BY SUM(i.total) DESC`,
        params
      ),
      query<QboStatusRow>(
        `SELECT
           (status = 'active') AS connected,
           company_name,
           last_sync_at::text,
           refresh_token_expires_at::text,
           status
         FROM qbo_connection
         ORDER BY connected_at DESC
         LIMIT 1`
      ).catch(() => []),
      query<QboSummaryRow>(
        `SELECT
           COALESCE(SUM(total_amount), 0)::text AS total_revenue,
           COALESCE(SUM(balance), 0)::text AS total_balance,
           COUNT(*)::text AS invoice_count
         FROM qbo_invoices
         WHERE txn_date >= $1::date
           AND txn_date < $2::date
           AND COALESCE(total_amount, 0) > 0`,
        qboParams
      ).catch(() => [{ total_revenue: "0", total_balance: "0", invoice_count: "0" }]),
      query<QboInvoiceRow>(
        `SELECT
           qi.qbo_id AS invoice_id,
           qi.doc_number,
           qi.customer_name,
           COALESCE(qi.total_amount, 0)::text AS amount,
           COALESCE(qi.balance, 0)::text AS balance,
           qi.status,
           qi.txn_date::text,
           i.jnid::text AS matched_jn_invoice_id,
           i.number::text AS matched_jn_invoice_number
         FROM qbo_invoices qi
         LEFT JOIN invoice_mapping im ON im.qbo_invoice_id = qi.qbo_id
         LEFT JOIN invoices i ON i.jnid = im.jn_invoice_id OR i.number::text = qi.doc_number
         LEFT JOIN jobs j ON j.jnid = i.job_jnid
         WHERE qi.txn_date >= $1::date
           AND qi.txn_date < $2::date
           AND COALESCE(qi.total_amount, 0) > 0
         ORDER BY qi.txn_date DESC NULLS LAST, qi.total_amount DESC`,
        qboParams
      ).catch(() => []),
    ]);

    const invoices = invoiceRows.map((row) => ({
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      total: money(row.total),
      totalPaid: money(row.total_paid),
      balance: money(row.balance),
      invoiceStatus: row.invoice_status,
      invoiceDate: row.invoice_date,
      invoiceCreatedAt: row.invoice_created_at,
      effectiveInvoiceDate: row.effective_invoice_date,
      jobJnid: row.job_jnid,
      jobName: row.job_name,
      jobStatus: row.job_status,
      recordTypeName: row.record_type_name ?? "Unknown",
      salesRepName: row.sales_rep_name ?? "Unassigned",
      sourceName: row.source_name ?? "Unknown",
      customerName: row.customer_name ?? "Unknown",
      jobNimbusUrl: `https://app.jobnimbus.com/job/${row.job_jnid}`,
      qbo: row.qbo_invoice_id
        ? {
            invoiceId: row.qbo_invoice_id,
            docNumber: row.qbo_doc_number,
            amount: money(row.qbo_amount),
            balance: money(row.qbo_balance),
            matchStatus: row.qbo_match_status,
            matchMethod: row.qbo_match_method,
            matchConfidence: row.qbo_match_confidence ? parseFloat(row.qbo_match_confidence) : null,
          }
        : null,
    }));

    const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const totalPaid = invoices.reduce((sum, invoice) => sum + invoice.totalPaid, 0);
    const totalBalance = invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
    const matchedToQbo = invoices.filter((invoice) => invoice.qbo !== null).length;
    const qboTotalRevenue = money(qboSummaryRows[0]?.total_revenue);
    const qboTotalBalance = money(qboSummaryRows[0]?.total_balance);
    const qboInvoiceCount = parseInt(qboSummaryRows[0]?.invoice_count ?? "0", 10);
    const jnRevenue = Math.round(totalRevenue * 100) / 100;
    const qboRevenueVariance = Math.round((qboTotalRevenue - jnRevenue) * 100) / 100;

    const mapBreakdown = (rows: BreakdownRow[]) =>
      rows.map((row) => ({ key: row.key, total: money(row.total), count: parseInt(row.count, 10) }));

    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      basis: {
        source: "JobNimbus invoices",
        dateField: "COALESCE(date_invoice, jn_date_created)",
        includedStatuses: INVOICED_STATUSES,
        excluded: "Inactive/archived jobs and obvious test/demo/sample jobs",
      },
      qboStatus: qboStatusRows[0] ?? {
        connected: false,
        company_name: null,
        last_sync_at: null,
        refresh_token_expires_at: null,
        status: "disconnected",
      },
      summary: {
        totalRevenue: jnRevenue,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalBalance: Math.round(totalBalance * 100) / 100,
        invoiceCount: invoices.length,
        matchedToQbo,
        unmatchedToQbo: invoices.length - matchedToQbo,
        qboTotalRevenue,
        qboTotalBalance,
        qboInvoiceCount,
        qboRevenueVariance,
      },
      breakdowns: {
        byStatus: mapBreakdown(byStatusRows),
        byType: mapBreakdown(byTypeRows),
        byRep: mapBreakdown(byRepRows),
      },
      invoices,
      qboInvoices: qboInvoiceRows.map((row) => ({
        invoiceId: row.invoice_id,
        docNumber: row.doc_number,
        customerName: row.customer_name ?? "Unknown",
        amount: money(row.amount),
        balance: money(row.balance),
        status: row.status ?? "Unknown",
        txnDate: row.txn_date,
        matchedJnInvoiceId: row.matched_jn_invoice_id,
        matchedJnInvoiceNumber: row.matched_jn_invoice_number,
      })),
    });
  } catch (error) {
    console.error("Revenue line-items API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
