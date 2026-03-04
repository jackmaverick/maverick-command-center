import { NextRequest, NextResponse } from "next/server";
import {
  runInvoiceMatching,
  getReconciliationData,
  updateMappingStatus,
} from "@/lib/reconciliation";
import { getQBOConnection } from "@/lib/quickbooks";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const conn = await getQBOConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "QuickBooks not connected" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "all";

    const data = await getReconciliationData({ status });
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Reconciliation API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const conn = await getQBOConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "QuickBooks not connected" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const action = body.action;

    if (action === "run_matching") {
      const result = await runInvoiceMatching();
      return NextResponse.json(result);
    }

    if (action === "update_status") {
      const { mappingId, status } = body;
      if (!mappingId || !["matched", "flagged"].includes(status)) {
        return NextResponse.json(
          { error: "Invalid mappingId or status" },
          { status: 400 }
        );
      }
      await updateMappingStatus(mappingId, status);
      return NextResponse.json({ success: true });
    }

    if (action === "debug_invoice") {
      const { docNumber } = body;
      if (!docNumber) {
        return NextResponse.json({ error: "docNumber required" }, { status: 400 });
      }
      const [jnRows, qboRows] = await Promise.all([
        query<{ jnid: string; number: string | null; total: string; total_paid: string; date_invoice: string | null }>(
          `SELECT jnid, number, total::text, COALESCE(total_paid, 0)::text AS total_paid, date_invoice::text
           FROM invoices WHERE number = $1 AND is_active = true`,
          [docNumber]
        ),
        query<{ qbo_id: string; doc_number: string | null; total_amount: string; balance: string; txn_date: string | null; raw_data: string }>(
          `SELECT qbo_id, doc_number, total_amount::text, balance::text, txn_date::text, raw_data::text
           FROM qbo_invoices WHERE doc_number = $1`,
          [docNumber]
        ),
      ]);
      return NextResponse.json({ jn: jnRows, qbo: qboRows });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Reconciliation API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
