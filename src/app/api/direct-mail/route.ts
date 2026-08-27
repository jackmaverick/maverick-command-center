import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isDirectMailSchemaUnavailable, loadDirectMailDashboard } from "@/lib/direct-mail/live-data";
import type { DirectMailDashboardUnavailable } from "@/lib/direct-mail/types";

export const dynamic = "force-dynamic";

function unavailable(code: DirectMailDashboardUnavailable["code"], message: string, status: number) {
  return NextResponse.json({ available: false, code, message }, { status });
}

export async function GET() {
  try {
    return NextResponse.json(await loadDirectMailDashboard(query));
  } catch (error) {
    if (isDirectMailSchemaUnavailable(error)) {
      return unavailable("schema_unavailable", "The Direct Mail Operating System reporting migration has not been deployed yet.", 503);
    }
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      return unavailable("configuration_unavailable", "The Command Center database connection is not configured.", 503);
    }
    console.error("[Direct Mail] Dashboard query failed", error);
    return unavailable("query_failed", "Direct-mail reporting could not be loaded.", 500);
  }
}
