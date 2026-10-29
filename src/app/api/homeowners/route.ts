import { NextRequest, NextResponse } from "next/server";
import { searchHomeowners } from "@/lib/homeowners/repository";
import { hasAuthorizedSession } from "@/lib/require-auth";
import { logServerError } from "@/lib/server-error";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await hasAuthorizedSession())) {
    console.warn("[Homeowners Search] Request denied: no authorized session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (search.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchHomeowners(search);
    return NextResponse.json({ results });
  } catch (error) {
    logServerError("[Homeowners Search] Failed", error);
    return NextResponse.json(
      { error: "Unable to search homeowners" },
      { status: 500 }
    );
  }
}
