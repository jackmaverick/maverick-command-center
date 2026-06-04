import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, isValidPeriodKey, toUnixSeconds } from "@/lib/dates";
import { segmentWhereClause } from "@/lib/segment";
import { STATUS_CONVERSIONS } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

const VALID_SEGMENTS: Segment[] = ["real_estate", "retail", "insurance", "repairs", "warranty"];

function buildJobFilter(
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

  conditions.push("j.is_active = true");
  conditions.push("j.is_archived = false");

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function statusMovePattern(from: string, to: string): string {
  const fromPattern = escapeRegex(from);
  const toPattern = escapeRegex(to);
  return `(Status:\\s*${fromPattern}\\s*=>\\s*${toPattern}|Status changed from\\s+${fromPattern}\\s+to\\s+${toPattern})`;
}

function statusArrivedPattern(status: string): string {
  const statusPattern = escapeRegex(status);
  return `(Status:\\s*[^\\n]+\\s*=>\\s*${statusPattern}|Status changed from\\s+[^\\n]+\\s+to\\s+${statusPattern})`;
}

function recordTypeChangePattern(): string {
  return `(Job Type|Type):\\s*([^\\n]+?)\\s*=>\\s*([^\\n]+)`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "month") as PeriodKey;
    const segmentParam = searchParams.get("segment") as Segment | null;
    const segment = segmentParam && VALID_SEGMENTS.includes(segmentParam) ? segmentParam : null;
    const repJnid = searchParams.get("rep_jnid") || null;

    if (!isValidPeriodKey(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);
    const baseFilter = buildJobFilter(startUnix, endUnix, segment, repJnid);

    const conversions = [];

    for (const conv of STATUS_CONVERSIONS) {
      const fromStatuses = Array.isArray(conv.from) ? [...conv.from] : [conv.from];
      const toStatuses = Array.isArray(conv.to) ? [...conv.to] : [conv.to];
      const movePatterns = fromStatuses.flatMap((from) => toStatuses.map((to) => statusMovePattern(from, to)));
      const arrivedPatterns = fromStatuses.map(statusArrivedPattern);

      const convertedRows = await query<{ count: string; avg_days: string | null }>(
        `WITH matched AS (
           SELECT DISTINCT ON (a.job_jnid)
             a.job_jnid,
             COALESCE(a.activity_date, to_timestamp(a.jn_date_created)) AS converted_at,
             j.jn_date_created AS created_at
           FROM activities a
           JOIN jobs j ON j.jnid = a.job_jnid
           WHERE ${baseFilter.where}
             AND COALESCE(a.activity_date, to_timestamp(a.jn_date_created)) >= $${baseFilter.nextIdx}
             AND COALESCE(a.activity_date, to_timestamp(a.jn_date_created)) < $${baseFilter.nextIdx + 1}
             AND COALESCE(a.content, '') ~* ANY($${baseFilter.nextIdx + 2}::text[])
           ORDER BY a.job_jnid, COALESCE(a.activity_date, to_timestamp(a.jn_date_created))
         )
         SELECT
           COUNT(*)::text AS count,
           AVG(EXTRACT(EPOCH FROM (converted_at - to_timestamp(created_at))) / 86400.0)::text AS avg_days
         FROM matched`,
        [...baseFilter.params, range.start, range.end, movePatterns]
      );

      const fromRows = await query<{ count: string }>(
        `WITH from_jobs AS (
           SELECT DISTINCT a.job_jnid
           FROM activities a
           JOIN jobs j ON j.jnid = a.job_jnid
           WHERE ${baseFilter.where}
             AND COALESCE(a.activity_date, to_timestamp(a.jn_date_created)) >= $${baseFilter.nextIdx}
             AND COALESCE(a.activity_date, to_timestamp(a.jn_date_created)) < $${baseFilter.nextIdx + 1}
             AND COALESCE(a.content, '') ~* ANY($${baseFilter.nextIdx + 2}::text[])
           UNION
           SELECT j.jnid
           FROM jobs j
           WHERE ${baseFilter.where}
             AND j.status_name = ANY($${baseFilter.nextIdx + 3}::text[])
         )
         SELECT COUNT(*)::text AS count FROM from_jobs`,
        [...baseFilter.params, range.start, range.end, arrivedPatterns, fromStatuses]
      );

      const convertedCount = parseInt(convertedRows[0]?.count ?? "0", 10);
      const fromCount = parseInt(fromRows[0]?.count ?? "0", 10);
      const totalInFunnel = Math.max(fromCount, convertedCount);
      const conversionRate = totalInFunnel > 0 ? (convertedCount / totalInFunnel) * 100 : 0;

      conversions.push({
        from: conv.from,
        to: conv.to,
        label: conv.label,
        converted_jobs: convertedCount,
        from_status_jobs: fromCount,
        conversion_rate: Math.round(conversionRate * 10) / 10,
        avg_days: convertedRows[0]?.avg_days ? Math.round(parseFloat(convertedRows[0].avg_days) * 10) / 10 : null,
        basis: "distinct_jobs_from_activity_history",
      });
    }

    const recordTypeChangeRows = await query<{
      from_type: string;
      to_type: string;
      changed_jobs: string;
    }>(
      `WITH changes AS (
         SELECT DISTINCT
           a.job_jnid,
           trim((regexp_match(COALESCE(a.content, ''), $${baseFilter.nextIdx}, 'i'))[2]) AS from_type,
           trim((regexp_match(COALESCE(a.content, ''), $${baseFilter.nextIdx}, 'i'))[3]) AS to_type
         FROM activities a
         JOIN jobs j ON j.jnid = a.job_jnid
         WHERE ${baseFilter.where}
           AND COALESCE(a.activity_date, to_timestamp(a.jn_date_created)) >= $${baseFilter.nextIdx + 1}
           AND COALESCE(a.activity_date, to_timestamp(a.jn_date_created)) < $${baseFilter.nextIdx + 2}
           AND COALESCE(a.content, '') ~* $${baseFilter.nextIdx}
       )
       SELECT from_type, to_type, COUNT(DISTINCT job_jnid)::text AS changed_jobs
       FROM changes
       WHERE from_type IS NOT NULL
         AND to_type IS NOT NULL
         AND from_type <> to_type
         AND from_type = ANY($${baseFilter.nextIdx + 3}::text[])
         AND to_type = ANY($${baseFilter.nextIdx + 3}::text[])
       GROUP BY from_type, to_type
       ORDER BY COUNT(DISTINCT job_jnid) DESC, from_type, to_type`,
      [...baseFilter.params, recordTypeChangePattern(), range.start, range.end, ["Retail", "Insurance", "Repairs", "Warranty", "Maintenance Plan"]]
    );

    return NextResponse.json({
      period: { key: period, label: range.label, start: range.start.toISOString(), end: range.end.toISOString() },
      segment: segment || "all",
      rep_jnid: repJnid || null,
      conversions,
      recordTypeChanges: recordTypeChangeRows.map((row) => ({
        fromType: row.from_type,
        toType: row.to_type,
        changedJobs: parseInt(row.changed_jobs, 10),
      })),
      note: "Current segment/revenue rollups use the job's current record type. Movement metrics use distinct jobs from JobNimbus activity history so a job is not counted twice in the same transition.",
    });
  } catch (error) {
    console.error("Conversions API error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
