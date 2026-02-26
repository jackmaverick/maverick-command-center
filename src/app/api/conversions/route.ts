import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL, segmentWhereClause } from "@/lib/segment";
import { STATUS_CONVERSIONS } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

const VALID_PERIODS: PeriodKey[] = [
  "week", "last_week", "month", "last_month", "quarter", "ytd", "all",
];

function buildFilter(
  startUnix: number,
  endUnix: number,
  segment: Segment | null,
  repJnid: string | null
): { where: string; params: unknown[]; nextIdx: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  conditions.push(`j.jn_date_created >= $${idx}`);
  params.push(startUnix);
  idx++;

  conditions.push(`j.jn_date_created < $${idx}`);
  params.push(endUnix);
  idx++;

  if (segment) {
    conditions.push(segmentWhereClause(idx));
    params.push(segment);
    idx++;
  }

  if (repJnid) {
    conditions.push(`j.sales_rep_jnid = $${idx}`);
    params.push(repJnid);
    idx++;
  }

  return { where: conditions.join(" AND "), params, nextIdx: idx };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "month") as PeriodKey;
    const segment = (searchParams.get("segment") as Segment | null) || null;
    const repJnid = searchParams.get("rep_jnid") || null;

    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    const baseFilter = buildFilter(startUnix, endUnix, segment, repJnid);

    // Calculate each conversion type based on current status
    // This is a simplified approach: count jobs at each status
    const conversions = [];

    for (const conv of STATUS_CONVERSIONS) {
      const fromStatuses = Array.isArray(conv.from) ? conv.from : [conv.from];
      const toStatuses = Array.isArray(conv.to) ? conv.to : [conv.to];

      // Count jobs that are currently at TO status
      const result = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM jobs j
         WHERE ${baseFilter.where}
         AND j.status_name = ANY($${baseFilter.nextIdx}::text[])`,
        [...baseFilter.params, toStatuses]
      );

      const convertedCount = parseInt(result[0]?.count ?? "0", 10);

      // Count jobs that are currently at FROM status (potential conversions)
      const fromResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM jobs j
         WHERE ${baseFilter.where}
         AND j.status_name = ANY($${baseFilter.nextIdx}::text[])`,
        [...baseFilter.params, fromStatuses]
      );

      const fromCount = parseInt(fromResult[0]?.count ?? "0", 10);
      
      // For conversion rate: already-converted / total-that-could-convert
      // This is simplified: in real life you'd need job_status_history
      const totalInFunnel = fromCount + convertedCount;
      const conversionRate = totalInFunnel > 0 ? (convertedCount / totalInFunnel) * 100 : 0;

      conversions.push({
        from: conv.from,
        to: conv.to,
        label: conv.label,
        converted_jobs: convertedCount,
        from_status_jobs: fromCount,
        conversion_rate: Math.round(conversionRate * 10) / 10,
        avg_days: null, // Would require job_status_history table
      });
    }

    return NextResponse.json({
      period: { key: period, label: range.label },
      segment: segment || "all",
      rep_jnid: repJnid || null,
      conversions,
    });
  } catch (error) {
    console.error("Conversions API error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
