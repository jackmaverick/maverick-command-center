import { NextRequest, NextResponse } from "next/server";
import { getHomeownerDetail } from "@/lib/homeowners/repository";
import { hasAuthorizedSession } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contactJnid: string }> }
) {
  if (!(await hasAuthorizedSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactJnid } = await context.params;
  const before = request.nextUrl.searchParams.get("before");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 100;

  try {
    const homeowner = await getHomeownerDetail(contactJnid, before, limit);
    if (!homeowner) {
      return NextResponse.json(
        { error: "Homeowner not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(homeowner);
  } catch (error) {
    console.error("[Homeowner Detail] Failed:", error);
    return NextResponse.json(
      { error: "Unable to load homeowner" },
      { status: 500 }
    );
  }
}
