import { NextRequest, NextResponse } from "next/server";
import { buildPipelineCashflowHealth } from "@/lib/pipeline-cashflow-monitor";

export const dynamic = "force-dynamic";

async function fetchPipelinePayload(request: NextRequest) {
  const url = new URL("/api/financial/pipeline-cashflow", request.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

export async function GET(request: NextRequest) {
  try {
    const apiData = await fetchPipelinePayload(request);
    const health = await buildPipelineCashflowHealth(apiData);
    const statusCode = health.status === "red" ? 503 : 200;
    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Pipeline Cashflow Health] Error:", message);
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
