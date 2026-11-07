import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { releaseDueReplies } from "@/lib/replies/service";
import { logServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!isCronAuthorized(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await releaseDueReplies());
  } catch (error) {
    logServerError("[Replies Queue] Release failed", error);
    return NextResponse.json(
      { error: "Queue release failed" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
