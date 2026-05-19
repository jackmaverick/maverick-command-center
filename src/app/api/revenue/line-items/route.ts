import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";

const VALID_PERIODS: PeriodKey[] = [
  "week",
  "last_week",
  "month",
  "last_month",
  "quarter",
  "ytd",
  "all",
];

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
    const period = VALID_PERIODS.includes(periodParam) ? periodParam : "month";
    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    const params = [startUnix, endUnix, INVOICED_STATUSES];
    const invoiceWhere = `
      i.is_active = true
      AND ${ACTIVE_REAL_JOB_WHERE}
      AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
      AND ${EFFECTIVE_INVOICE_DATE} >= $1
      AND ${EFFECTIVE_INVOICE_DATE} < $2
    `;

    const [invoiceRows, byStatusRows, byTypeRows, byRepRows, qboStatusRows] = await Promise.all([
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
           im.qbo_invoice_id,
           qi.doc_number AS qbo_doc_number,
           qi.total_amount::text AS qbo_amount,
           qi.balance::text AS qbo_balance,
           im.status AS qbo_match_status,
           im.match_method AS qbo_match_method,
           im.match_confidence::text AS qbo_match_confidence
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         LEFT JOIN contacts c ON c.jnid = i.contact_jnid
         LEFT JOIN invoice_mapping im ON im.jn_invoice_id = i.jnid
         LEFT JOIN qbo_invoices qi ON qi.qbo_id = im.qbo_invoice_id
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
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalBalance: Math.round(totalBalance * 100) / 100,
        invoiceCount: invoices.length,
        matchedToQbo,
        unmatchedToQbo: invoices.length - matchedToQbo,
      },
      breakdowns: {
        byStatus: mapBreakdown(byStatusRows),
        byType: mapBreakdown(byTypeRows),
        byRep: mapBreakdown(byRepRows),
      },
      invoices,
    });
  } catch (error) {
    console.error("Revenue line-items API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
