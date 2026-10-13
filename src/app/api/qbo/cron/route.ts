import { NextRequest, NextResponse } from "next/server";
import { getQBOConnection } from "@/lib/quickbooks";
import { runIncrementalQboSync } from "@/lib/qbo-sync";
import { checkRefreshTokenExpiry } from "@/lib/qbo-token-alert";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function handleCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conn = await getQBOConnection();
    if (!conn) {
      return NextResponse.json({
        success: true,
        source: "qbo-cron",
        skipped: true,
        reason: "No active QuickBooks connection. Reconnect from /settings to resume automated sync.",
      });
    }

    const result = await runIncrementalQboSync(45_000);
    // Never blocks/breaks sync: internally try/caught, dedupes to 1 email/day
    const tokenAlert = await checkRefreshTokenExpiry();
    return NextResponse.json({ success: true, source: "qbo-cron", tokenAlert, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Cron] Error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}
