import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { WeeklySnapshot } from "@/types";

// ── GET /api/snapshots ──────────────────────────────────────────────────────
// Returns stored snapshots ordered by week_start DESC.
//
// Query params:
//   ?type=weekly|monthly  (default: "weekly")
//   ?limit=12             (default: 12, max 100)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TYPES = ["weekly", "monthly"] as const;
type SnapshotType = (typeof VALID_TYPES)[number];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse & validate type
    const typeParam = searchParams.get("type") ?? "weekly";
    const snapshotType: SnapshotType = VALID_TYPES.includes(
      typeParam as SnapshotType
    )
      ? (typeParam as SnapshotType)
      : "weekly";

    // Parse & validate limit
    const limitParam = parseInt(searchParams.get("limit") ?? "12", 10);
    const limit = Math.min(Math.max(limitParam || 12, 1), 100);

    const rows = await query<WeeklySnapshot>(
      `SELECT
         id,
         week_start,
         week_end,
         snapshot_type,
         metrics,
         created_at
       FROM app_weekly_snapshots
       WHERE snapshot_type = $1
       ORDER BY week_start DESC
       LIMIT $2`,
      [snapshotType, limit]
    );

    return NextResponse.json({ snapshots: rows });
  } catch (error) {
    console.error("[Snapshots API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch snapshots" },
      { status: 500 }
    );
  }
}
