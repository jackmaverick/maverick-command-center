import { NextResponse } from "next/server";
import { buildLoopHealth } from "@/lib/loop-health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const localOnly = url.searchParams.get("localOnly") === "1";
    const health = await buildLoopHealth({ includeSnapshots: !localOnly });
    const statusCode = health.summary.failing > 0 ? 207 : 200;
    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    console.error("Error building loop health:", error);
    return NextResponse.json(
      {
        error: "Failed to build loop health",
        mode: "read-only",
      },
      { status: 500 }
    );
  }
}
