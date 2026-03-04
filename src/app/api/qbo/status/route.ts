import { NextResponse } from "next/server";
import { getQBOConnection, getAccessToken } from "@/lib/quickbooks";
import { query } from "@/lib/db";
import type { QBOConnectionStatus } from "@/types";

async function fetchAndUpdateCompanyName(conn: { id: string; realm_id: string }): Promise<string | null> {
  try {
    const { token, realmId } = await getAccessToken();
    const env = process.env.QBO_ENVIRONMENT ?? "sandbox";
    const baseUrl = env === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";

    const res = await fetch(
      `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      const name = data.CompanyInfo?.CompanyName ?? null;
      if (name) {
        await query(
          `UPDATE qbo_connection SET company_name = $1 WHERE id = $2`,
          [name, conn.id]
        );
        return name;
      }
    }
  } catch (e) {
    console.error("[QBO Status] Failed to fetch company name:", e);
  }
  return null;
}

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

    // If company name is missing, try to fetch it now
    let companyName = conn.company_name;
    if (!companyName && conn.status === "active") {
      companyName = await fetchAndUpdateCompanyName(conn);
    }

    const status: QBOConnectionStatus = {
      connected: conn.status === "active",
      companyName,
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
