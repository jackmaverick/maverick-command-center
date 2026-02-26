import { NextRequest, NextResponse } from "next/server";
import { runFullSync } from "@/lib/sync";

/**
 * POST /api/sync
 * Manually trigger a full sync from JobNimbus to Supabase
 */
export async function POST(request: NextRequest) {
  try {
    const result = await runFullSync();
    return NextResponse.json(result, {
      status: result.status === "completed" ? 200 : 500,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync
 * Check sync status and last sync time
 */
export async function GET(request: NextRequest) {
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const logs = await pool.query(`
      SELECT
        resource,
        status,
        created_at,
        details
      FROM sync_log
      ORDER BY created_at DESC
      LIMIT 10
    `);

    await pool.end();

    return NextResponse.json({
      recentLogs: logs.rows,
      status: "connected",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: String(error),
      },
      { status: 500 }
    );
  }
}
