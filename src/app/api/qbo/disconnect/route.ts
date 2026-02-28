import { NextResponse } from "next/server";
import { revokeConnection } from "@/lib/quickbooks";

export async function POST() {
  try {
    await revokeConnection();
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Disconnect] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
