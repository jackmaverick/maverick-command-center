import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

/**
 * POST /api/recovery
 * Full data recovery from JobNimbus
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const adminKey = process.env.ADMIN_RECOVERY_KEY;

  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const startTime = Date.now();

    await pool.query(
      `INSERT INTO sync_log (resource, status, details, created_at)
       VALUES ('recovery', 'started', $1, now())`,
      [JSON.stringify({ timestamp: new Date().toISOString() })]
    );

    // Clear sync cursors for full re-sync
    try {
      await pool.query(`TRUNCATE sync_cursors CASCADE`);
    } catch {
      // Table might not exist, that's OK
    }

    await pool.query(
      `INSERT INTO sync_log (resource, status, details, created_at)
       VALUES ('recovery', 'completed', $1, now())`,
      [
        JSON.stringify({
          duration: Date.now() - startTime,
          message: "Recovery mode enabled. Next sync will be full.",
        }),
      ]
    );

    return NextResponse.json({
      status: "recovery_enabled",
      message: "Next /api/sync call will perform full re-sync.",
      duration: Date.now() - startTime,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: String(error),
      },
      { status: 500 }
    );
  } finally {
    await pool.end();
  }
}

/**
 * GET /api/recovery
 * Check recovery status
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    recovery: {
      description: "Full data recovery from JobNimbus",
      instructions: [
        "1. Set ADMIN_RECOVERY_KEY environment variable",
        "2. POST to /api/recovery with Authorization: Bearer <ADMIN_RECOVERY_KEY>",
        "3. Next sync call will perform full re-sync",
      ],
    },
  });
}
