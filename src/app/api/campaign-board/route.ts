import { NextResponse } from "next/server";
import { getCampaignBoard } from "@/lib/homeowners/repository";
import { hasAuthorizedSession } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET() {
  if (!(await hasAuthorizedSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getCampaignBoard());
  } catch (error) {
    console.error("[Campaign Board] Failed:", error);
    return NextResponse.json(
      { error: "Unable to load campaign board" },
      { status: 500 }
    );
  }
}
