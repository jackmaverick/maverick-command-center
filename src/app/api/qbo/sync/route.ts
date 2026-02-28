import { NextResponse } from "next/server";
import { qboQuery, updateLastSync } from "@/lib/quickbooks";
import { query } from "@/lib/db";

interface QBOInvoice {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { name: string; value: string };
  TotalAmt: number;
  Balance: number;
  DueDate?: string;
  TxnDate: string;
  // Derived from Balance: Paid if Balance=0, Open otherwise
}

interface QBOPayment {
  Id: string;
  CustomerRef?: { name: string; value: string };
  TotalAmt: number;
  TxnDate: string;
  PaymentMethodRef?: { name: string };
  Line?: { LinkedTxn?: { TxnId: string; TxnType: string }[] }[];
}

export async function POST() {
  try {
    // Sync invoices
    const invoices = await qboQuery<QBOInvoice>(
      "SELECT * FROM Invoice MAXRESULTS 1000"
    );

    for (const inv of invoices) {
      const status = inv.Balance === 0 ? "Paid" : "Open";
      await query(
        `INSERT INTO qbo_invoices (qbo_id, doc_number, customer_name, total_amount, balance, due_date, txn_date, status, raw_data, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (qbo_id) DO UPDATE SET
           doc_number = EXCLUDED.doc_number,
           customer_name = EXCLUDED.customer_name,
           total_amount = EXCLUDED.total_amount,
           balance = EXCLUDED.balance,
           due_date = EXCLUDED.due_date,
           txn_date = EXCLUDED.txn_date,
           status = EXCLUDED.status,
           raw_data = EXCLUDED.raw_data,
           last_synced_at = NOW()`,
        [
          inv.Id,
          inv.DocNumber ?? null,
          inv.CustomerRef?.name ?? null,
          inv.TotalAmt,
          inv.Balance,
          inv.DueDate ?? null,
          inv.TxnDate,
          status,
          JSON.stringify(inv),
        ]
      );
    }

    // Sync payments
    const payments = await qboQuery<QBOPayment>(
      "SELECT * FROM Payment MAXRESULTS 1000"
    );

    for (const pmt of payments) {
      const linkedIds: string[] = [];
      if (pmt.Line) {
        for (const line of pmt.Line) {
          if (line.LinkedTxn) {
            for (const txn of line.LinkedTxn) {
              if (txn.TxnType === "Invoice") {
                linkedIds.push(txn.TxnId);
              }
            }
          }
        }
      }

      await query(
        `INSERT INTO qbo_payments (qbo_id, customer_name, total_amount, txn_date, payment_method, linked_invoice_ids, raw_data, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (qbo_id) DO UPDATE SET
           customer_name = EXCLUDED.customer_name,
           total_amount = EXCLUDED.total_amount,
           txn_date = EXCLUDED.txn_date,
           payment_method = EXCLUDED.payment_method,
           linked_invoice_ids = EXCLUDED.linked_invoice_ids,
           raw_data = EXCLUDED.raw_data,
           last_synced_at = NOW()`,
        [
          pmt.Id,
          pmt.CustomerRef?.name ?? null,
          pmt.TotalAmt,
          pmt.TxnDate,
          pmt.PaymentMethodRef?.name ?? null,
          linkedIds,
          JSON.stringify(pmt),
        ]
      );
    }

    await updateLastSync();

    return NextResponse.json({
      success: true,
      invoicesSynced: invoices.length,
      paymentsSynced: payments.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Sync] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
