import { NextResponse } from "next/server";
import { getCampaignBoard } from "@/lib/homeowners/repository";
import { hasAuthorizedSession } from "@/lib/require-auth";
import { logServerError } from "@/lib/server-error";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasAuthorizedSession())) {
    console.warn("[Campaign Board] Request denied: no authorized session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const board = await getCampaignBoard();
    console.info("[Campaign Board] Loaded", {
      campaigns: board.campaigns.length,
      warnings: board.warnings.map((warning) => warning.source),
    });
    return NextResponse.json(board);
  } catch (error) {
    logServerError("[Campaign Board] Unexpected failure", error);
    return NextResponse.json(
      { error: "Unable to load campaign board" },
      { status: 500 }
    );
  }
}
