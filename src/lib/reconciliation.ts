/**
 * Invoice & Payment Reconciliation Engine
 * Matches JN invoices ↔ QBO invoices and Stripe payments ↔ QBO payments
 */

import { query } from "@/lib/db";
import type { InvoiceReconRow, ReconciliationSummary } from "@/types";

interface JNInvoiceRow {
  jnid: string;
  number: string | null;
  total: string;
  total_paid: string;
  date_invoice: string | null;
  customer_name: string | null;
}

interface QBOInvoiceRow {
  qbo_id: string;
  doc_number: string | null;
  total_amount: string;
  balance: string;
  txn_date: string | null;
  customer_name: string | null;
}

interface MappingRow {
  jn_invoice_id: string | null;
  qbo_invoice_id: string | null;
  match_confidence: string;
  match_method: string;
  status: string;
}

/**
 * Run the matching engine: compare JN invoices against QBO invoices.
 * Matching priority:
 * 1. Doc number exact match → confidence 1.0
 * 2. Amount + date (within 3 days) → 0.9
 * 3. Amount + customer name fuzzy match → 0.8
 * 4. Amount-only in same period → 0.5
 */
export async function runInvoiceMatching(): Promise<{
  matched: number;
  newMatches: number;
}> {
  // Fetch all JN invoices and QBO invoices
  const [jnInvoices, qboInvoices, existingMappings] = await Promise.all([
    query<JNInvoiceRow>(
      `SELECT
         i.jnid,
         i.number,
         i.total::text,
         COALESCE(i.total_paid, 0)::text AS total_paid,
         i.date_invoice::text,
         COALESCE(c.display_name, 'Unknown') AS customer_name
       FROM invoices i
       LEFT JOIN contacts c ON c.jnid = i.contact_jnid
       WHERE i.is_active = true`
    ),
    query<QBOInvoiceRow>(
      `SELECT qbo_id, doc_number, total_amount::text, balance::text, txn_date::text, customer_name
       FROM qbo_invoices`
    ),
    query<MappingRow>(
      `SELECT jn_invoice_id, qbo_invoice_id, match_confidence::text, match_method, status
       FROM invoice_mapping`
    ),
  ]);

  // Build lookup sets for existing mappings
  const mappedJN = new Set(existingMappings.map((m) => m.jn_invoice_id));
  const mappedQBO = new Set(existingMappings.map((m) => m.qbo_invoice_id));

  let newMatches = 0;

  // Unmapped JN invoices
  const unmappedJN = jnInvoices.filter((inv) => !mappedJN.has(inv.jnid));
  const unmappedQBO = qboInvoices.filter(
    (inv) => !mappedQBO.has(inv.qbo_id)
  );

  for (const jn of unmappedJN) {
    let bestMatch: { qboId: string; confidence: number; method: string } | null = null;

    for (const qbo of unmappedQBO) {
      if (mappedQBO.has(qbo.qbo_id)) continue;

      // 1. Doc number exact match
      if (
        jn.number &&
        qbo.doc_number &&
        jn.number.trim() === qbo.doc_number.trim()
      ) {
        bestMatch = { qboId: qbo.qbo_id, confidence: 1.0, method: "doc_number" };
        break;
      }

      const jnAmount = parseFloat(jn.total);
      const qboAmount = parseFloat(qbo.total_amount);
      const amountMatch =
        Math.abs(jnAmount - qboAmount) < 0.01 && jnAmount > 0;

      if (!amountMatch) continue;

      // 2. Amount + date (within 3 days)
      if (jn.date_invoice && qbo.txn_date) {
        const jnDate = new Date(parseInt(jn.date_invoice) * 1000);
        const qboDate = new Date(qbo.txn_date);
        const daysDiff = Math.abs(
          (jnDate.getTime() - qboDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff <= 3) {
          if (!bestMatch || bestMatch.confidence < 0.9) {
            bestMatch = { qboId: qbo.qbo_id, confidence: 0.9, method: "amount_date" };
          }
          continue;
        }
      }

      // 3. Amount + customer name fuzzy match
      if (jn.customer_name && qbo.customer_name) {
        const jnName = jn.customer_name.toLowerCase().trim();
        const qboName = qbo.customer_name.toLowerCase().trim();
        if (
          jnName.includes(qboName) ||
          qboName.includes(jnName) ||
          jnName === qboName
        ) {
          if (!bestMatch || bestMatch.confidence < 0.8) {
            bestMatch = {
              qboId: qbo.qbo_id,
              confidence: 0.8,
              method: "amount_customer",
            };
          }
          continue;
        }
      }

      // 4. Amount-only in same period (30-day window)
      if (jn.date_invoice && qbo.txn_date) {
        const jnDate = new Date(parseInt(jn.date_invoice) * 1000);
        const qboDate = new Date(qbo.txn_date);
        const daysDiff = Math.abs(
          (jnDate.getTime() - qboDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff <= 30) {
          if (!bestMatch || bestMatch.confidence < 0.5) {
            bestMatch = {
              qboId: qbo.qbo_id,
              confidence: 0.5,
              method: "amount_only",
            };
          }
        }
      }
    }

    if (bestMatch) {
      await query(
        `INSERT INTO invoice_mapping (jn_invoice_id, qbo_invoice_id, match_confidence, match_method, status)
         VALUES ($1, $2, $3, $4, 'auto')
         ON CONFLICT DO NOTHING`,
        [jn.jnid, bestMatch.qboId, bestMatch.confidence, bestMatch.method]
      );
      mappedQBO.add(bestMatch.qboId);
      newMatches++;
    }
  }

  return {
    matched: existingMappings.length + newMatches,
    newMatches,
  };
}

/**
 * Get reconciliation summary and detail rows.
 */
export async function getReconciliationData(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<{
  summary: ReconciliationSummary;
  invoiceRows: InvoiceReconRow[];
}> {
  // Get all JN invoices, QBO invoices, and mappings
  const [jnInvoices, qboInvoices, mappings] = await Promise.all([
    query<JNInvoiceRow & { id: string }>(
      `SELECT
         i.id,
         i.jnid,
         i.number,
         i.total::text,
         COALESCE(i.total_paid, 0)::text AS total_paid,
         i.date_invoice::text,
         COALESCE(c.display_name, 'Unknown') AS customer_name
       FROM invoices i
       LEFT JOIN contacts c ON c.jnid = i.contact_jnid
       WHERE i.is_active = true
       ORDER BY i.date_invoice DESC`
    ),
    query<QBOInvoiceRow & { id: string }>(
      `SELECT id, qbo_id, doc_number, total_amount::text, balance::text, txn_date::text, customer_name
       FROM qbo_invoices
       ORDER BY txn_date DESC`
    ),
    query<MappingRow & { id: string }>(
      `SELECT id, jn_invoice_id, qbo_invoice_id, match_confidence::text, match_method, status
       FROM invoice_mapping`
    ),
  ]);

  const jnMap = new Map(jnInvoices.map((inv) => [inv.jnid, inv]));
  const qboMap = new Map(qboInvoices.map((inv) => [inv.qbo_id, inv]));
  const mappedJN = new Set(mappings.map((m) => m.jn_invoice_id));
  const mappedQBO = new Set(mappings.map((m) => m.qbo_invoice_id));

  const invoiceRows: InvoiceReconRow[] = [];

  // Matched rows
  for (const mapping of mappings) {
    const jn = mapping.jn_invoice_id ? jnMap.get(mapping.jn_invoice_id) : null;
    const qbo = mapping.qbo_invoice_id
      ? qboMap.get(mapping.qbo_invoice_id)
      : null;

    const jnAmount = jn ? parseFloat(jn.total) : null;
    const qboAmount = qbo ? parseFloat(qbo.total_amount) : null;
    const amountDiff =
      jnAmount !== null && qboAmount !== null
        ? Math.round((jnAmount - qboAmount) * 100) / 100
        : null;

    const status: InvoiceReconRow["status"] =
      mapping.status === "flagged"
        ? "flagged"
        : amountDiff !== null && Math.abs(amountDiff) > 0.01
          ? "amount_mismatch"
          : "matched";

    invoiceRows.push({
      id: mapping.id,
      jnInvoiceId: mapping.jn_invoice_id,
      jnDocNumber: jn?.number ?? null,
      jnAmount,
      qboInvoiceId: mapping.qbo_invoice_id,
      qboDocNumber: qbo?.doc_number ?? null,
      qboAmount,
      matchConfidence: parseFloat(mapping.match_confidence),
      matchMethod: mapping.match_method,
      status,
      amountDifference: amountDiff,
      customerName: jn?.customer_name ?? qbo?.customer_name ?? null,
      txnDate: jn?.date_invoice
        ? new Date(parseInt(jn.date_invoice) * 1000).toISOString()
        : qbo?.txn_date ?? null,
    });
  }

  // Missing in QB (JN invoices without match)
  for (const jn of jnInvoices) {
    if (mappedJN.has(jn.jnid)) continue;
    invoiceRows.push({
      id: `jn-${jn.jnid}`,
      jnInvoiceId: jn.jnid,
      jnDocNumber: jn.number,
      jnAmount: parseFloat(jn.total),
      qboInvoiceId: null,
      qboDocNumber: null,
      qboAmount: null,
      matchConfidence: null,
      matchMethod: null,
      status: "missing_in_qb",
      amountDifference: null,
      customerName: jn.customer_name,
      txnDate: jn.date_invoice
        ? new Date(parseInt(jn.date_invoice) * 1000).toISOString()
        : null,
    });
  }

  // Missing in JN (QBO invoices without match)
  for (const qbo of qboInvoices) {
    if (mappedQBO.has(qbo.qbo_id)) continue;
    invoiceRows.push({
      id: `qbo-${qbo.qbo_id}`,
      jnInvoiceId: null,
      jnDocNumber: null,
      jnAmount: null,
      qboInvoiceId: qbo.qbo_id,
      qboDocNumber: qbo.doc_number,
      qboAmount: parseFloat(qbo.total_amount),
      matchConfidence: null,
      matchMethod: null,
      status: "missing_in_jn",
      amountDifference: null,
      customerName: qbo.customer_name,
      txnDate: qbo.txn_date,
    });
  }

  // Apply filters
  let filtered = invoiceRows;
  if (filters?.status && filters.status !== "all") {
    filtered = filtered.filter((r) => r.status === filters.status);
  }

  // Summary counts
  const summary: ReconciliationSummary = {
    matched: invoiceRows.filter((r) => r.status === "matched").length,
    missingInQB: invoiceRows.filter((r) => r.status === "missing_in_qb")
      .length,
    missingInJN: invoiceRows.filter((r) => r.status === "missing_in_jn")
      .length,
    amountMismatches: invoiceRows.filter(
      (r) => r.status === "amount_mismatch"
    ).length,
    totalJNInvoices: jnInvoices.length,
    totalQBInvoices: qboInvoices.length,
  };

  return { summary, invoiceRows: filtered };
}

/**
 * Manually mark a mapping as matched or flagged.
 */
export async function updateMappingStatus(
  mappingId: string,
  status: "matched" | "flagged"
): Promise<void> {
  await query(`UPDATE invoice_mapping SET status = $1 WHERE id = $2`, [
    status,
    mappingId,
  ]);
}
