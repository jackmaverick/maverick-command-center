import { NextRequest, NextResponse } from "next/server";
import { getConversationThread } from "@/lib/inbox/thread";
import type { WorkspaceKey } from "@/lib/inbox/types";
import { decodeTimelineCursor } from "@/lib/homeowners/timeline";
import { hasAuthorizedSession } from "@/lib/require-auth";
import { logServerError } from "@/lib/server-error";

export const runtime = "nodejs";
export const maxDuration = 30;

const WORKSPACES = new Set<WorkspaceKey>([
  "speed_to_lead",
  "insurance",
  "sales_follow_up",
  "general",
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contactJnid: string }> }
) {
  if (!(await hasAuthorizedSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaceParam =
    request.nextUrl.searchParams.get("workspace") ?? "insurance";
  if (!WORKSPACES.has(workspaceParam as WorkspaceKey)) {
    return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
  }
  const { contactJnid } = await context.params;
  const beforeParam = request.nextUrl.searchParams.get("before");
  const before = beforeParam ? decodeTimelineCursor(beforeParam) : null;
  if (beforeParam && !before) {
    return NextResponse.json(
      { error: "Invalid timeline cursor" },
      { status: 400 }
    );
  }

  try {
    const thread = await getConversationThread(
      contactJnid,
      workspaceParam as WorkspaceKey,
      before
    );
    if (!thread) {
      return NextResponse.json(
        { error: "Homeowner not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(thread);
  } catch (error) {
    logServerError("[Campaign Thread] Unexpected failure", error);
    return NextResponse.json(
      { error: "Unable to load conversation" },
      { status: 500 }
    );
  }
}
