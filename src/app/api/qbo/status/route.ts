import { NextResponse } from "next/server";
import { getQBOConnection } from "@/lib/quickbooks";
import type { QBOConnectionStatus } from "@/types";

export async function GET() {
  try {
    const conn = await getQBOConnection();

    if (!conn) {
      const status: QBOConnectionStatus = {
        connected: false,
        companyName: null,
        lastSync: null,
        refreshTokenExpiresAt: null,
        status: "disconnected",
      };
      return NextResponse.json(status);
    }

    const status: QBOConnectionStatus = {
      connected: conn.status === "active",
      companyName: conn.company_name,
      lastSync: conn.last_sync_at,
      refreshTokenExpiresAt: conn.refresh_token_expires_at,
      status: conn.status,
    };

    return NextResponse.json(status);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Status] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
