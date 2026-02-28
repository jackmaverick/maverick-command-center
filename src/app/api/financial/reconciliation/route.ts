import { NextRequest, NextResponse } from "next/server";
import {
  runInvoiceMatching,
  getReconciliationData,
  updateMappingStatus,
} from "@/lib/reconciliation";
import { getQBOConnection } from "@/lib/quickbooks";

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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Reconciliation API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
