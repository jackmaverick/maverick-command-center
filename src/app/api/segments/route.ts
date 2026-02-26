import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import {
  ORDERED_STATUSES,
  LOSS_STATUSES,
  STATUS_TO_STAGE,
  STAGES,
} from "@/lib/constants";
import type { Segment } from "@/lib/constants";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_PERIODS: PeriodKey[] = [
  "week",
  "last_week",
  "month",
  "last_month",
  "quarter",
  "ytd",
  "all",
];

const VALID_SEGMENTS: Segment[] = [
  "real_estate",
  "retail",
  "insurance",
  "repairs",
];

/** Statuses at or past "Sold Job" count as won. */
const WON_STATUSES = (() => {
  const idx = ORDERED_STATUSES.indexOf("Sold Job");
  return ORDERED_STATUSES.slice(idx);
})();

/** Consecutive status pairs for speed/conversion metrics. */
const STATUS_PAIRS = (() => {
  const pairs: { from: string; to: string }[] = [];
  for (let i = 0; i < ORDERED_STATUSES.length - 1; i++) {
    pairs.push({ from: ORDERED_STATUSES[i], to: ORDERED_STATUSES[i + 1] });
  }
  return pairs;
})();

// ── Helpers ──────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * SQL fragment: (SEGMENT_SQL) = $N
 * Inline so we don't need to import segmentWhereClause for a single usage.
 */
function segWhere(paramIdx: number): string {
  return `(${SEGMENT_SQL}) = $${paramIdx}`;
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ── Parse & validate params ────────────────────────────────────────

    const segmentParam = searchParams.get("segment") as Segment | null;
    if (!segmentParam || !VALID_SEGMENTS.includes(segmentParam)) {
      return NextResponse.json(
        {
          error:
            "Missing or invalid 'segment' parameter. Must be one of: real_estate, retail, insurance, repairs",
        },
        { status: 400 }
      );
    }
    const segment: Segment = segmentParam;

    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = VALID_PERIODS.includes(periodParam) ? periodParam : "month";
    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    // Common base params: $1=startUnix, $2=endUnix, $3=segment
    const baseParams: unknown[] = [startUnix, endUnix, segment];
    // Common WHERE for jobs in this segment + date range
    const jobWhere = `j.jn_date_created >= $1 AND j.jn_date_created < $2 AND ${segWhere(3)}`;

    // ── Run all queries in parallel ────────────────────────────────────

    const [
      coreRows,
      revenueRows,
      avgTicketRows,
      pipelineRows,
      stageCountRows,
      repPerfRows,
      lossAnalysisRows,
      speedRows,
      companyConvRows,
    ] = await Promise.all([
      // 1. Core metrics: total jobs, won, lost
      // $1=start, $2=end, $3=segment, $4=WON, $5=LOSS
      query<{ total_jobs: string; won_jobs: string; lost_jobs: string }>(
        `SELECT
           COUNT(*)::text AS total_jobs,
           COUNT(*) FILTER (WHERE j.status_name = ANY($4::text[]))::text AS won_jobs,
           COUNT(*) FILTER (WHERE j.status_name = ANY($5::text[]))::text AS lost_jobs
         FROM jobs j
         WHERE ${jobWhere}`,
        [...baseParams, [...WON_STATUSES], [...LOSS_STATUSES]]
      ),

      // 2. Revenue (accrual basis, invoices.date_invoice)
      // $1=start, $2=end, $3=segment
      query<{ revenue: string }>(
        `SELECT COALESCE(SUM(i.total), 0)::text AS revenue
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice < $2
           AND ${segWhere(3)}`,
        baseParams
      ),

      // 3. Avg ticket
      // $1=start, $2=end, $3=segment
      query<{ avg_ticket: string }>(
        `SELECT COALESCE(AVG(i.total), 0)::text AS avg_ticket
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice < $2
           AND i.total > 0
           AND ${segWhere(3)}`,
        baseParams
      ),

      // 4. Pipeline value (active non-closed jobs in segment)
      // $1=segment only
      query<{ pipeline_value: string }>(
        `SELECT COALESCE(SUM(j.approved_estimate_total), 0)::text AS pipeline_value
         FROM jobs j
         WHERE j.is_active = true
           AND j.is_closed = false
           AND j.is_archived = false
           AND ${segWhere(1)}`,
        [segment]
      ),

      // 5. Stage counts (current snapshot, active jobs in segment)
      // $1=segment only
      query<{ status_name: string; count: string }>(
        `SELECT
           j.status_name,
           COUNT(*)::text AS count
         FROM jobs j
         WHERE j.is_active = true
           AND j.is_archived = false
           AND j.status_name IS NOT NULL
           AND ${segWhere(1)}
         GROUP BY j.status_name`,
        [segment]
      ),

      // 6. Per-rep performance within this segment
      // $1=start, $2=end, $3=segment, $4=WON, $5=LOSS
      query<{
        sales_rep_jnid: string;
        sales_rep_name: string;
        total_jobs: string;
        won_jobs: string;
        lost_jobs: string;
        revenue: string;
      }>(
        `SELECT
           j.sales_rep_jnid,
           COALESCE(j.sales_rep_name, u.name, 'Unknown') AS sales_rep_name,
           COUNT(*)::text AS total_jobs,
           COUNT(*) FILTER (WHERE j.status_name = ANY($4::text[]))::text AS won_jobs,
           COUNT(*) FILTER (WHERE j.status_name = ANY($5::text[]))::text AS lost_jobs,
           COALESCE(SUM(j.approved_invoice_total), 0)::text AS revenue
         FROM jobs j
         LEFT JOIN jobnimbus_users u ON u.jnid = j.sales_rep_jnid
         WHERE ${jobWhere}
           AND j.sales_rep_jnid IS NOT NULL
         GROUP BY j.sales_rep_jnid, j.sales_rep_name, u.name
         ORDER BY COUNT(*) DESC`,
        [...baseParams, [...WON_STATUSES], [...LOSS_STATUSES]]
      ),

      // 7. Loss analysis: which stage jobs were in before entering a loss status
      // $1=start, $2=end, $3=segment, $4=LOSS
      query<{ last_stage: string; loss_count: string }>(
        `WITH lost_jobs AS (
           SELECT DISTINCT ON (h.job_jnid)
             h.job_jnid,
             h.from_stage_name AS last_stage
           FROM job_stage_history h
           JOIN jobs j ON j.jnid = h.job_jnid
           WHERE ${jobWhere}
             AND h.to_stage_name = ANY($4::text[])
             AND h.from_stage_name IS NOT NULL
             AND h.from_stage_name != ALL($4::text[])
           ORDER BY h.job_jnid, h.changed_at DESC
         )
         SELECT
           last_stage,
           COUNT(*)::text AS loss_count
         FROM lost_jobs
         GROUP BY last_stage
         ORDER BY COUNT(*) DESC`,
        [...baseParams, [...LOSS_STATUSES]]
      ),

      // 8. Speed metrics: avg days between consecutive status pairs
      // $1=start, $2=end, $3=segment, then $4+ for pair values
      (() => {
        const pairStartIdx = 4;
        const pairValues = STATUS_PAIRS.map(
          (_, i) =>
            `($${pairStartIdx + i * 2}::text, $${pairStartIdx + i * 2 + 1}::text)`
        ).join(", ");
        const pairParams = STATUS_PAIRS.flatMap((p) => [p.from, p.to]);

        return query<{
          from_stage: string;
          to_stage: string;
          avg_days: string;
        }>(
          `WITH pairs(from_s, to_s) AS (
             VALUES ${pairValues}
           ),
           transitions AS (
             SELECT
               h_from.to_stage_name AS from_stage,
               h_to.to_stage_name AS to_stage,
               EXTRACT(EPOCH FROM (MIN(h_to.changed_at) - MAX(h_from.changed_at))) / 86400.0 AS days_diff
             FROM pairs p
             JOIN job_stage_history h_from
               ON h_from.to_stage_name = p.from_s
             JOIN job_stage_history h_to
               ON h_to.job_jnid = h_from.job_jnid
               AND h_to.to_stage_name = p.to_s
               AND h_to.changed_at > h_from.changed_at
             JOIN jobs j ON j.jnid = h_from.job_jnid
             WHERE ${jobWhere}
             GROUP BY h_from.job_jnid, h_from.to_stage_name, h_to.to_stage_name
           )
           SELECT
             from_stage,
             to_stage,
             COALESCE(AVG(days_diff), 0)::text AS avg_days
           FROM transitions
           WHERE days_diff >= 0
           GROUP BY from_stage, to_stage
           ORDER BY from_stage`,
          [...baseParams, ...pairParams]
        );
      })(),

      // 9. Company-wide conversion rate (all segments) for comparison
      // $1=start, $2=end, $3=WON
      query<{ total: string; won: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]))::text AS won
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2`,
        [startUnix, endUnix, [...WON_STATUSES]]
      ),
    ]);

    // ── Process results ────────────────────────────────────────────────

    // 1. Core metrics
    const totalJobs = parseInt(coreRows[0]?.total_jobs ?? "0", 10);
    const wonJobs = parseInt(coreRows[0]?.won_jobs ?? "0", 10);
    const lostJobs = parseInt(coreRows[0]?.lost_jobs ?? "0", 10);
    const closeRate = totalJobs > 0 ? round1((wonJobs / totalJobs) * 100) : 0;
    const activeJobs = totalJobs - wonJobs - lostJobs;

    // 2. Revenue
    const revenue = round2(parseFloat(revenueRows[0]?.revenue ?? "0"));

    // 3. Avg ticket
    const avgTicket = round2(parseFloat(avgTicketRows[0]?.avg_ticket ?? "0"));

    // 4. Pipeline value
    const pipelineValue = round2(
      parseFloat(pipelineRows[0]?.pipeline_value ?? "0")
    );

    // 5. Stage counts - aggregate JN statuses into high-level stages
    const stageCounts: Record<string, number> = {};
    for (const stage of STAGES) {
      stageCounts[stage] = 0;
    }
    const statusCounts: Record<string, number> = {};
    for (const row of stageCountRows) {
      statusCounts[row.status_name] = parseInt(row.count, 10);
      const stage = STATUS_TO_STAGE[row.status_name];
      if (stage) {
        stageCounts[stage] += parseInt(row.count, 10);
      }
    }

    // 6. Per-rep performance
    const repPerformance = repPerfRows.map((row) => {
      const repTotal = parseInt(row.total_jobs, 10);
      const repWon = parseInt(row.won_jobs, 10);
      const repLost = parseInt(row.lost_jobs, 10);
      return {
        repId: row.sales_rep_jnid,
        repName: row.sales_rep_name,
        totalJobs: repTotal,
        wonJobs: repWon,
        lostJobs: repLost,
        closeRate: repTotal > 0 ? round1((repWon / repTotal) * 100) : 0,
        revenue: round2(parseFloat(row.revenue)),
      };
    });

    // 7. Loss analysis
    const totalLost = lossAnalysisRows.reduce(
      (s, r) => s + parseInt(r.loss_count, 10),
      0
    );
    const lossAnalysis = lossAnalysisRows.map((row) => {
      const count = parseInt(row.loss_count, 10);
      const stage = STATUS_TO_STAGE[row.last_stage] ?? row.last_stage;
      return {
        stage,
        rawStatus: row.last_stage,
        count,
        rate: totalLost > 0 ? round1((count / totalLost) * 100) : 0,
      };
    });

    // 8. Speed metrics
    const speedMetrics = speedRows.map((row) => ({
      from: row.from_stage,
      to: row.to_stage,
      avgDays: round1(parseFloat(row.avg_days)),
    }));

    // 9. Company average conversion
    const companyTotal = parseInt(companyConvRows[0]?.total ?? "0", 10);
    const companyWon = parseInt(companyConvRows[0]?.won ?? "0", 10);
    const companyAvgConversion =
      companyTotal > 0 ? round1((companyWon / companyTotal) * 100) : 0;

    // Avg cycle time = sum of all consecutive pair averages
    const avgCycleTime = round1(
      speedMetrics.reduce((sum, m) => sum + m.avgDays, 0)
    );

    // ── Assemble response ──────────────────────────────────────────────

    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      segment,
      summary: {
        totalJobs,
        activeJobs,
        wonJobs,
        lostJobs,
        closeRate,
        revenue,
        avgTicket,
        pipelineValue,
        avgCycleTimeDays: avgCycleTime,
      },
      stageCounts,
      statusCounts,
      repPerformance,
      lossAnalysis,
      speedMetrics,
      companyAvgConversion,
      conversionDelta: round1(closeRate - companyAvgConversion),
    });
  } catch (error) {
    console.error("[Segments API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch segment metrics" },
      { status: 500 }
    );
  }
}
