import { NextResponse } from "next/server";
import { buildPipelineCashflowFreshness } from "@/lib/pipeline-cashflow-monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const freshness = await buildPipelineCashflowFreshness();
    const statusCode = freshness.status === "red" ? 503 : 200;
    return NextResponse.json(freshness, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Pipeline Cashflow Freshness] Error:", message);
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        status: "red",
        error: message,
      },
      { status: 503 }
    );
  }
}
