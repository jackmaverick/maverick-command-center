/**
 * Bulk invoice-matching run + reconciliation report.
 *
 * Runs the 4-tier matching engine (src/lib/reconciliation.ts) across all
 * active JN invoices vs qbo_invoices, populating invoice_mapping, then
 * prints match stats and the "JN shows open balance but QBO says PAID" audit.
 *
 * Read/insert on invoice_mapping only — never modifies invoices, jobs, or QBO data.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/run-invoice-matching.ts [--stats-only]
 */

import { runInvoiceMatching } from "../src/lib/reconciliation";
import { query, getPool } from "../src/lib/db";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function main() {
  const statsOnly = process.argv.includes("--stats-only");

  if (!statsOnly) {
    console.log("Running invoice matching engine...");
    const started = Date.now();
    const result = await runInvoiceMatching();
    console.log(
      `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — total mapped: ${result.matched}, new matches this run: ${result.newMatches}\n`
    );
  }

  // --- Match stats by tier ---
  const tiers = await query<{ match_method: string; n: string; conf: string }>(
    `SELECT match_method, COUNT(*)::text AS n, AVG(match_confidence)::text AS conf
     FROM invoice_mapping GROUP BY match_method ORDER BY MIN(match_confidence) DESC`
  );
  console.log("=== invoice_mapping by tier ===");
  for (const t of tiers) console.log(`  ${t.match_method}: ${t.n}`);

  const [counts] = await query<{ jn: string; qbo: string; mapped: string }>(
    `SELECT
       (SELECT COUNT(*) FROM invoices WHERE is_active = true)::text AS jn,
       (SELECT COUNT(*) FROM qbo_invoices)::text AS qbo,
       (SELECT COUNT(*) FROM invoice_mapping)::text AS mapped`
  );
  console.log(
    `\nActive JN invoices: ${counts.jn} | QBO invoices: ${counts.qbo} | mappings: ${counts.mapped}`
  );

  // --- Unmatched samples with likely reasons ---
  const unmatchedJN = await query<{
    jnid: string;
    number: string | null;
    total: string;
    customer_name: string | null;
    date_invoice: string | null;
  }>(
    `SELECT i.jnid, i.number, i.total::text, c.display_name AS customer_name, i.date_invoice::text
     FROM invoices i
     LEFT JOIN contacts c ON c.jnid = i.contact_jnid
     WHERE i.is_active = true
       AND i.jnid NOT IN (SELECT jn_invoice_id FROM invoice_mapping WHERE jn_invoice_id IS NOT NULL)
     ORDER BY i.total DESC`
  );
  const unmatchedQBO = await query<{
    qbo_id: string;
    doc_number: string | null;
    total_amount: string;
    customer_name: string | null;
    txn_date: string | null;
  }>(
    `SELECT qbo_id, doc_number, total_amount::text, customer_name, txn_date::text
     FROM qbo_invoices
     WHERE qbo_id NOT IN (SELECT qbo_invoice_id FROM invoice_mapping WHERE qbo_invoice_id IS NOT NULL)
     ORDER BY total_amount::numeric DESC`
  );
  console.log(`\nUnmatched JN invoices: ${unmatchedJN.length}`);
  console.log(`Unmatched QBO invoices: ${unmatchedQBO.length}`);

  console.log("\n=== Sample unmatched JN invoices (top 15 by $) ===");
  for (const u of unmatchedJN.slice(0, 15)) {
    const d = u.date_invoice
      ? new Date(parseInt(u.date_invoice) * 1000).toISOString().slice(0, 10)
      : "no-date";
    console.log(
      `  JN #${u.number ?? "?"} ${usd(parseFloat(u.total))} ${d} ${u.customer_name ?? "Unknown"}`
    );
  }
  console.log("\n=== Sample unmatched QBO invoices (top 15 by $) ===");
  for (const u of unmatchedQBO.slice(0, 15)) {
    console.log(
      `  QBO #${u.doc_number ?? "?"} ${usd(parseFloat(u.total_amount))} ${u.txn_date ?? "no-date"} ${u.customer_name ?? "Unknown"}`
    );
  }

  // --- Reconciliation: JN open balance but QBO fully paid ---
  const glitch = await query<{
    number: string | null;
    customer_name: string | null;
    jn_total: string;
    jn_paid: string;
    jn_due: string;
    qbo_doc: string | null;
    qbo_total: string;
    qbo_balance: string;
    match_method: string;
  }>(
    `SELECT
       i.number,
       c.display_name AS customer_name,
       i.total::text AS jn_total,
       COALESCE(i.total_paid, 0)::text AS jn_paid,
       (i.total - COALESCE(i.total_paid, 0))::text AS jn_due,
       q.doc_number AS qbo_doc,
       q.total_amount::text AS qbo_total,
       q.balance::text AS qbo_balance,
       m.match_method
     FROM invoice_mapping m
     JOIN invoices i ON i.jnid = m.jn_invoice_id
     JOIN qbo_invoices q ON q.qbo_id = m.qbo_invoice_id
     LEFT JOIN contacts c ON c.jnid = i.contact_jnid
     WHERE i.is_active = true
       AND (i.total - COALESCE(i.total_paid, 0)) > 0.01
       AND q.balance <= 0.01
     ORDER BY (i.total - COALESCE(i.total_paid, 0)) DESC`
  );
  const totalDue = glitch.reduce((s, g) => s + parseFloat(g.jn_due), 0);
  console.log(
    `\n=== JN-open-but-QBO-PAID (the suspected glitch) ===\nCount: ${glitch.length} invoices | JN open balance total: ${usd(totalDue)}`
  );
  for (const g of glitch.slice(0, 25)) {
    console.log(
      `  #${g.number ?? "?"} (${g.match_method}) JN due ${usd(parseFloat(g.jn_due))} of ${usd(parseFloat(g.jn_total))} — QBO balance ${usd(parseFloat(g.qbo_balance))} of ${usd(parseFloat(g.qbo_total))} — ${g.customer_name ?? "Unknown"}`
    );
  }

  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
