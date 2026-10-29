import { NextRequest, NextResponse } from "next/server";
import { getInbox } from "@/lib/inbox/repository";
import type { WorkspaceKey } from "@/lib/inbox/types";
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

export async function GET(request: NextRequest) {
  if (!(await hasAuthorizedSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceParam =
    request.nextUrl.searchParams.get("workspace") ?? "insurance";
  if (!WORKSPACES.has(workspaceParam as WorkspaceKey)) {
    return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
  }
  const workspace = workspaceParam as WorkspaceKey;
  const page = Math.max(
    0,
    Number.parseInt(request.nextUrl.searchParams.get("page") ?? "0", 10) || 0
  );
  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(
        request.nextUrl.searchParams.get("pageSize") ?? "50",
        10
      ) || 50
    )
  );
  const openParam = request.nextUrl.searchParams.get("open");
  const open =
    openParam === "done" || openParam === "any" ? openParam : "open";

  try {
    const startedAt = Date.now();
    const result = await getInbox(workspace, {
      search: request.nextUrl.searchParams.get("search")?.trim() ?? "",
      page,
      pageSize,
      open,
      unread: request.nextUrl.searchParams.get("unread") === "true",
      unresponded:
        request.nextUrl.searchParams.get("unresponded") === "true",
      board: request.nextUrl.searchParams.get("view") === "board",
    });
    console.info("[Campaign Inbox] Loaded", {
      workspace,
      rows: result.rows.length,
      durationMs: Date.now() - startedAt,
      warnings: result.warnings.map((warning) => warning.source),
    });
    return NextResponse.json(result);
  } catch (error) {
    logServerError("[Campaign Inbox] Unexpected failure", error);
    return NextResponse.json(
      { error: "Unable to load campaign inbox" },
      { status: 500 }
    );
  }
}
