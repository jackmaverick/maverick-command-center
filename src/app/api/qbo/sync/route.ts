import { NextResponse } from "next/server";
import { runFullQboSync } from "@/lib/qbo-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runFullQboSync();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Sync] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
