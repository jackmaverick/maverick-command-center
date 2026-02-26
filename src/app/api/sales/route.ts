import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL, segmentWhereClause } from "@/lib/segment";
import { ORDERED_STATUSES, LOSS_STATUSES } from "@/lib/constants";
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

/** Statuses at or past "Signed Contract" count as won. */
const WON_STATUSES = (() => {
  const idx = ORDERED_STATUSES.indexOf("Signed Contract");
  return ORDERED_STATUSES.slice(idx);
})();

/** Activity type codes considered outbound follow-ups. */
const FOLLOWUP_TYPES = ["note", "call", "email", "text"];

/** Consecutive status pairs for conversion tracking. */
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

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return round1(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/**
 * Build a parameterized WHERE clause and params array for jobs filtered by
 * date range, optional segment, and optional rep. Returns the clause string
 * (without leading WHERE/AND) and the params array.
 *
 * The job table alias must be `j`.
 */
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

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse & validate params
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = VALID_PERIODS.includes(periodParam) ? periodParam : "month";
    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    const segmentParam = searchParams.get("segment") as Segment | null;
    const segment =
      segmentParam && VALID_SEGMENTS.includes(segmentParam)
        ? segmentParam
        : null;

    const repParam = searchParams.get("rep"); // sales_rep_jnid or null

    // Build reusable filter for job queries
    const jf = buildJobFilter(startUnix, endUnix, segment, repParam);

    // ── 1. Active reps ─────────────────────────────────────────────────

    const repsRows = await query<{ jnid: string; name: string }>(
      `SELECT jnid, name
       FROM jobnimbus_users
       WHERE is_active = true
       ORDER BY name`
    );

    // ── 2. Per-rep core metrics (jobs / won / lost) ────────────────────

    const wonIdx = jf.nextIdx;
    const lossIdx = jf.nextIdx + 1;

    const repCoreRows = await query<{
      sales_rep_jnid: string;
      total_jobs: string;
      won_jobs: string;
      lost_jobs: string;
    }>(
      `SELECT
         j.sales_rep_jnid,
         COUNT(*)::text AS total_jobs,
         COUNT(*) FILTER (WHERE j.status_name = ANY($${wonIdx}::text[]))::text AS won_jobs,
         COUNT(*) FILTER (WHERE j.status_name = ANY($${lossIdx}::text[]))::text AS lost_jobs
       FROM jobs j
       WHERE ${jf.where}
         AND j.sales_rep_jnid IS NOT NULL
       GROUP BY j.sales_rep_jnid`,
      [...jf.params, [...WON_STATUSES], [...LOSS_STATUSES]]
    );

    // ── 3. Revenue per rep (accrual basis via invoices) ────────────────
    // This is an independent query with its own param numbering.
    // Joins invoices -> jobs (aliased jj) for segment/rep filtering.

    const invConditions: string[] = [
      `i.is_active = true`,
      `i.date_invoice >= $1`,
      `i.date_invoice < $2`,
      `jj.sales_rep_jnid IS NOT NULL`,
    ];
    const invParams: unknown[] = [startUnix, endUnix];
    let invIdx = 3;

    if (segment) {
      // Replace j. with jj. in SEGMENT_SQL for the invoice join alias
      const segSqlJJ = SEGMENT_SQL.replace(/j\./g, "jj.");
      invConditions.push(`(${segSqlJJ}) = $${invIdx}`);
      invParams.push(segment);
      invIdx++;
    }
    if (repParam) {
      invConditions.push(`jj.sales_rep_jnid = $${invIdx}`);
      invParams.push(repParam);
      invIdx++;
    }

    const revenueRows = await query<{
      sales_rep_jnid: string;
      revenue: string;
    }>(
      `SELECT
         jj.sales_rep_jnid,
         COALESCE(SUM(i.total), 0)::text AS revenue
       FROM invoices i
       JOIN jobs jj ON jj.jnid = i.job_jnid
       WHERE ${invConditions.join(" AND ")}
       GROUP BY jj.sales_rep_jnid`,
      invParams
    );

    const revenueByRep: Record<string, number> = {};
    for (const r of revenueRows) {
      revenueByRep[r.sales_rep_jnid] = parseFloat(r.revenue);
    }

    // ── 4. Segment close rates per rep ─────────────────────────────────
    // Uses same base filter + WON_STATUSES for the FILTER clause.

    const segWonIdx = jf.nextIdx;

    const segCloseRows = await query<{
      sales_rep_jnid: string;
      segment: string;
      total: string;
      won: string;
    }>(
      `SELECT
         j.sales_rep_jnid,
         (${SEGMENT_SQL}) AS segment,
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE j.status_name = ANY($${segWonIdx}::text[]))::text AS won
       FROM jobs j
       WHERE ${jf.where}
         AND j.sales_rep_jnid IS NOT NULL
       GROUP BY j.sales_rep_jnid, segment`,
      [...jf.params, [...WON_STATUSES]]
    );

    const segCloseMap: Record<string, Record<Segment, number>> = {};
    for (const row of segCloseRows) {
      if (!segCloseMap[row.sales_rep_jnid]) {
        segCloseMap[row.sales_rep_jnid] = {
          real_estate: 0,
          retail: 0,
          insurance: 0,
          repairs: 0,
        };
      }
      const total = parseInt(row.total, 10);
      const won = parseInt(row.won, 10);
      segCloseMap[row.sales_rep_jnid][row.segment as Segment] =
        total > 0 ? round1((won / total) * 100) : 0;
    }

    // ── 5. Status-by-status conversion per rep ─────────────────────────
    // Independent query: count transitions between each consecutive status pair.

    // Build VALUES list starting after jf params
    const convPairStartIdx = jf.nextIdx;
    const convPairValues = STATUS_PAIRS.map(
      (_, i) =>
        `($${convPairStartIdx + i * 2}::text, $${convPairStartIdx + i * 2 + 1}::text)`
    ).join(", ");
    const convPairParams = STATUS_PAIRS.flatMap((p) => [p.from, p.to]);

    const conversionRows = await query<{
      sales_rep_jnid: string;
      from_stage: string;
      to_stage: string;
      transitioned: string;
    }>(
      `WITH pairs(from_s, to_s) AS (
         VALUES ${convPairValues}
       )
       SELECT
         j.sales_rep_jnid,
         p.from_s AS from_stage,
         p.to_s AS to_stage,
         COUNT(DISTINCT h.job_jnid)::text AS transitioned
       FROM pairs p
       JOIN job_stage_history h
         ON h.from_stage_name = p.from_s
         AND h.to_stage_name = p.to_s
       JOIN jobs j ON j.jnid = h.job_jnid
       WHERE ${jf.where}
         AND j.sales_rep_jnid IS NOT NULL
       GROUP BY j.sales_rep_jnid, p.from_s, p.to_s`,
      [...jf.params, ...convPairParams]
    );

    // Count how many of each rep's jobs ever entered each "from" status
    // (to compute conversion rate = transitioned / entered-from-stage)
    const fromStatusIdx = jf.nextIdx;
    const fromCountRows = await query<{
      sales_rep_jnid: string;
      stage_name: string;
      cnt: string;
    }>(
      `SELECT
         j.sales_rep_jnid,
         h.to_stage_name AS stage_name,
         COUNT(DISTINCT h.job_jnid)::text AS cnt
       FROM job_stage_history h
       JOIN jobs j ON j.jnid = h.job_jnid
       WHERE ${jf.where}
         AND j.sales_rep_jnid IS NOT NULL
         AND h.to_stage_name = ANY($${fromStatusIdx}::text[])
       GROUP BY j.sales_rep_jnid, h.to_stage_name`,
      [...jf.params, [...ORDERED_STATUSES]]
    );

    // Build lookup maps
    const fromCountMap: Record<string, Record<string, number>> = {};
    for (const row of fromCountRows) {
      if (!fromCountMap[row.sales_rep_jnid])
        fromCountMap[row.sales_rep_jnid] = {};
      fromCountMap[row.sales_rep_jnid][row.stage_name] = parseInt(row.cnt, 10);
    }

    const transitionMap: Record<string, Record<string, number>> = {};
    for (const row of conversionRows) {
      if (!transitionMap[row.sales_rep_jnid])
        transitionMap[row.sales_rep_jnid] = {};
      transitionMap[row.sales_rep_jnid][
        `${row.from_stage}|${row.to_stage}`
      ] = parseInt(row.transitioned, 10);
    }

    // ── 6. Follow-up metrics per rep ───────────────────────────────────
    // Count outbound activities after Estimate Sent and Appointment Scheduled.

    const fuTypesIdx = jf.nextIdx;
    const followUpRows = await query<{
      sales_rep_jnid: string;
      job_jnid: string;
      milestone: string;
      followup_count: string;
    }>(
      `WITH milestones AS (
         SELECT
           j.sales_rep_jnid,
           h.job_jnid,
           h.to_stage_name AS milestone,
           MIN(h.changed_at) AS milestone_date
         FROM job_stage_history h
         JOIN jobs j ON j.jnid = h.job_jnid
         WHERE ${jf.where}
           AND j.sales_rep_jnid IS NOT NULL
           AND h.to_stage_name IN ('Estimate Sent', 'Appointment Scheduled')
         GROUP BY j.sales_rep_jnid, h.job_jnid, h.to_stage_name
       )
       SELECT
         m.sales_rep_jnid,
         m.job_jnid,
         m.milestone,
         COUNT(a.id)::text AS followup_count
       FROM milestones m
       LEFT JOIN activities a
         ON a.job_jnid = m.job_jnid
         AND a.activity_type_code = ANY($${fuTypesIdx}::text[])
         AND a.activity_date > m.milestone_date
       GROUP BY m.sales_rep_jnid, m.job_jnid, m.milestone`,
      [...jf.params, FOLLOWUP_TYPES]
    );

    const followUpMap: Record<
      string,
      { afterEstimate: number[]; afterAppointment: number[] }
    > = {};
    for (const row of followUpRows) {
      const rep = row.sales_rep_jnid;
      if (!followUpMap[rep]) {
        followUpMap[rep] = { afterEstimate: [], afterAppointment: [] };
      }
      const count = parseInt(row.followup_count, 10);
      if (row.milestone === "Estimate Sent") {
        followUpMap[rep].afterEstimate.push(count);
      } else {
        followUpMap[rep].afterAppointment.push(count);
      }
    }

    // ── 7. Time between statuses per rep ───────────────────────────────
    // Reuse the same pair VALUES pattern.

    const tbPairStartIdx = jf.nextIdx;
    const tbPairValues = STATUS_PAIRS.map(
      (_, i) =>
        `($${tbPairStartIdx + i * 2}::text, $${tbPairStartIdx + i * 2 + 1}::text)`
    ).join(", ");
    const tbPairParams = STATUS_PAIRS.flatMap((p) => [p.from, p.to]);

    const timeBetweenRows = await query<{
      sales_rep_jnid: string;
      from_stage: string;
      to_stage: string;
      avg_days: string;
    }>(
      `WITH pairs(from_s, to_s) AS (
         VALUES ${tbPairValues}
       ),
       transitions AS (
         SELECT
           j.sales_rep_jnid,
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
         WHERE ${jf.where}
           AND j.sales_rep_jnid IS NOT NULL
         GROUP BY j.sales_rep_jnid, h_from.job_jnid, h_from.to_stage_name, h_to.to_stage_name
       )
       SELECT
         sales_rep_jnid,
         from_stage,
         to_stage,
         COALESCE(AVG(days_diff), 0)::text AS avg_days
       FROM transitions
       WHERE days_diff >= 0
       GROUP BY sales_rep_jnid, from_stage, to_stage`,
      [...jf.params, ...tbPairParams]
    );

    const timeBetweenMap: Record<
      string,
      { fromStatus: string; toStatus: string; avgDays: number }[]
    > = {};
    for (const row of timeBetweenRows) {
      if (!timeBetweenMap[row.sales_rep_jnid])
        timeBetweenMap[row.sales_rep_jnid] = [];
      timeBetweenMap[row.sales_rep_jnid].push({
        fromStatus: row.from_stage,
        toStatus: row.to_stage,
        avgDays: round1(parseFloat(row.avg_days)),
      });
    }

    // ── Assemble per-rep response ──────────────────────────────────────

    const coreByRep: Record<
      string,
      { totalJobs: number; wonJobs: number; lostJobs: number }
    > = {};
    for (const row of repCoreRows) {
      coreByRep[row.sales_rep_jnid] = {
        totalJobs: parseInt(row.total_jobs, 10),
        wonJobs: parseInt(row.won_jobs, 10),
        lostJobs: parseInt(row.lost_jobs, 10),
      };
    }

    function totalCycleDays(repJnid: string): number {
      const entries = timeBetweenMap[repJnid];
      if (!entries || entries.length === 0) return 0;
      return round1(entries.reduce((sum, e) => sum + e.avgDays, 0));
    }

    const reps = repsRows.map((rep) => {
      const core = coreByRep[rep.jnid] ?? {
        totalJobs: 0,
        wonJobs: 0,
        lostJobs: 0,
      };
      const revenue = revenueByRep[rep.jnid] ?? 0;
      const closeRate =
        core.totalJobs > 0
          ? round1((core.wonJobs / core.totalJobs) * 100)
          : 0;
      const avgCycleDays = totalCycleDays(rep.jnid);

      // Status conversions
      const statusConversions = STATUS_PAIRS.map((pair) => {
        const fromCount = fromCountMap[rep.jnid]?.[pair.from] ?? 0;
        const transitioned =
          transitionMap[rep.jnid]?.[`${pair.from}|${pair.to}`] ?? 0;
        const rate =
          fromCount > 0 ? round1((transitioned / fromCount) * 100) : 0;
        const tbEntry = timeBetweenMap[rep.jnid]?.find(
          (e) => e.fromStatus === pair.from && e.toStatus === pair.to
        );
        return {
          fromStatus: pair.from,
          toStatus: pair.to,
          jobCount: transitioned,
          conversionRate: rate,
          avgDays: tbEntry?.avgDays ?? 0,
        };
      });

      // Follow-up metrics
      const fuData = followUpMap[rep.jnid] ?? {
        afterEstimate: [],
        afterAppointment: [],
      };
      const followUpMetrics = {
        avgAfterEstimate: avg(fuData.afterEstimate),
        avgAfterAppointment: avg(fuData.afterAppointment),
        jobsWithZeroFollowUp:
          fuData.afterEstimate.filter((n) => n === 0).length +
          fuData.afterAppointment.filter((n) => n === 0).length,
      };

      // Time between statuses
      const timeBetweenStatuses = timeBetweenMap[rep.jnid] ?? [];

      return {
        repId: rep.jnid,
        repName: rep.name,
        totalJobs: core.totalJobs,
        wonJobs: core.wonJobs,
        lostJobs: core.lostJobs,
        closeRate,
        avgCycleDays,
        revenue: round2(revenue),
        segmentCloseRates: segCloseMap[rep.jnid] ?? {
          real_estate: 0,
          retail: 0,
          insurance: 0,
          repairs: 0,
        },
        statusConversions,
        followUpMetrics,
        timeBetweenStatuses,
      };
    });

    // Filter to only reps with data (or the requested rep)
    const filteredReps = repParam
      ? reps.filter((r) => r.repId === repParam)
      : reps.filter((r) => r.totalJobs > 0 || r.revenue > 0);

    // ── Company-wide aggregates ────────────────────────────────────────

    const totalRevenue = filteredReps.reduce((s, r) => s + r.revenue, 0);
    const totalJobsAll = filteredReps.reduce((s, r) => s + r.totalJobs, 0);
    const totalWon = filteredReps.reduce((s, r) => s + r.wonJobs, 0);
    const avgCloseRate =
      totalJobsAll > 0 ? round1((totalWon / totalJobsAll) * 100) : 0;
    const repsWithCycle = filteredReps.filter((r) => r.avgCycleDays > 0);
    const avgCycleTime =
      repsWithCycle.length > 0
        ? round1(
            repsWithCycle.reduce((s, r) => s + r.avgCycleDays, 0) /
              repsWithCycle.length
          )
        : 0;

    // ── Return response ────────────────────────────────────────────────

    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      filters: {
        segment: segment ?? "all",
        rep: repParam ?? "all",
      },
      summary: {
        totalRevenue: round2(totalRevenue),
        avgCloseRate,
        avgCycleTimeDays: avgCycleTime,
        activeReps: filteredReps.length,
        totalJobs: totalJobsAll,
        totalWon,
      },
      reps: filteredReps,
    });
  } catch (error) {
    console.error("[Sales API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales metrics" },
      { status: 500 }
    );
  }
}
