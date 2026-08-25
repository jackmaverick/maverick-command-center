import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, getPreviousDateRange, isValidPeriodKey, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import { STATUS_TO_STAGE, STAGES, CHART_COLORS } from "@/lib/constants";

// Valid period keys for input validation

// Statuses that count as "converted" (Sold or later)
const CONVERTED_STATUSES = Object.entries(STATUS_TO_STAGE)
  .filter(([, stage]) => {
    const stageIndex = STAGES.indexOf(stage);
    const soldIndex = STAGES.indexOf("Sold");
    return stageIndex >= soldIndex;
  })
  .map(([status]) => status);

const INVOICED_STATUSES = ["Sent", "Open", "Closed"];
const ACTIVE_REAL_JOB_WHERE = `
  j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;
const EFFECTIVE_INVOICE_DATE = "COALESCE(i.date_invoice, i.jn_date_created)";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;

    // Validate period
    const period = isValidPeriodKey(periodParam) ? periodParam : "month";
    const range = getDateRange(period);

    // Convert date range to unix seconds for BIGINT columns
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    // Run all queries in parallel for performance
    const [
      revenueRows,
      pipelineRows,
      newLeadsRows,
      conversionRows,
      avgTicketRows,
      previousRevenueRows,
      funnelRows,
      revenueByTypeRows,
      leadSourceRows,
      opportunitiesBySegmentRows,
      soldJobsBySegmentRows,
      qboRevenueRows,
      soldThisPeriodByTradeRows,
      soldThisPeriodBySegmentRows,
    ] = await Promise.all([
      // 1. YTD Revenue (accrual basis - uses date_invoice BIGINT)
      query<{ total: string }>(
        `SELECT COALESCE(SUM(i.total), 0) AS total
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND ${ACTIVE_REAL_JOB_WHERE}
           AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
           AND ${EFFECTIVE_INVOICE_DATE} >= $1
           AND ${EFFECTIVE_INVOICE_DATE} < $2`,
        [startUnix, endUnix, INVOICED_STATUSES]
      ),

      // 2. Pipeline Value - active estimates on jobs that are not closed/archived
      //    (jobs in estimate-related statuses that haven't been fully invoiced)
      query<{ total: string }>(
        `SELECT COALESCE(SUM(e.total), 0) AS total
         FROM estimates e
         JOIN jobs j ON j.jnid = e.job_jnid
         WHERE e.is_active = true
           AND j.is_active = true
           AND j.is_closed = false
           AND j.is_archived = false
           AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
           AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
           AND j.status_name IN (
             'Estimating', 'Estimate Sent', 'Sold Job',
             'Production Ready', 'In Progress',
             'Insurance Pending', 'Invoiced'
           )`,
        []
      ),

      // 3. New Leads - jobs created in period (active, non-archived only)
      query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND ${ACTIVE_REAL_JOB_WHERE}`,
        [startUnix, endUnix]
      ),

      // 4. Conversion Rate - jobs that reached 'Sold Job' or later / total in period (active, non-archived)
      query<{ total: string; converted: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (
             WHERE j.status_name = ANY($3::text[])
           ) AS converted
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND ${ACTIVE_REAL_JOB_WHERE}`,
        [startUnix, endUnix, CONVERTED_STATUSES]
      ),

      // 5. Avg Ticket - average invoice total for invoiced jobs in period
      query<{ avg_ticket: string }>(
        `SELECT COALESCE(AVG(i.total), 0) AS avg_ticket
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND ${ACTIVE_REAL_JOB_WHERE}
           AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
           AND ${EFFECTIVE_INVOICE_DATE} >= $1
           AND ${EFFECTIVE_INVOICE_DATE} < $2
           AND i.total > 0`,
        [startUnix, endUnix, INVOICED_STATUSES]
      ),

      // 6. Previous period revenue for delta calculation
      (() => {
        const prevRange = getPreviousDateRange(period);
        if (!prevRange) {
          return Promise.resolve([{ total: null }] as { total: string | null }[]);
        }
        const prevStartUnix = toUnixSeconds(prevRange.start);
        const prevEndUnix = toUnixSeconds(prevRange.end);
        return query<{ total: string | null }>(
          `SELECT COALESCE(SUM(i.total), 0) AS total
           FROM invoices i
           JOIN jobs j ON j.jnid = i.job_jnid
           WHERE i.is_active = true
             AND ${ACTIVE_REAL_JOB_WHERE}
             AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
             AND ${EFFECTIVE_INVOICE_DATE} >= $1
             AND ${EFFECTIVE_INVOICE_DATE} < $2`,
          [prevStartUnix, prevEndUnix, INVOICED_STATUSES]
        );
      })(),

      // 7. Sales Funnel - period cohort (jobs created in period, where do they sit now)
      query<{ status_name: string; count: string }>(
        `SELECT j.status_name, COUNT(*) AS count
         FROM jobs j
         WHERE ${ACTIVE_REAL_JOB_WHERE}
           AND j.status_name IS NOT NULL
           AND j.jn_date_created >= $1
           AND j.jn_date_created < $2
         GROUP BY j.status_name`,
        [startUnix, endUnix]
      ),

      // 8. Revenue by Job Type (record_type_name)
      query<{ record_type_name: string; total: string }>(
        `SELECT
           COALESCE(j.record_type_name, 'Unknown') AS record_type_name,
           COALESCE(SUM(i.total), 0) AS total
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND ${ACTIVE_REAL_JOB_WHERE}
           AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
           AND ${EFFECTIVE_INVOICE_DATE} >= $1
           AND ${EFFECTIVE_INVOICE_DATE} < $2
         GROUP BY j.record_type_name
         ORDER BY total DESC`,
        [startUnix, endUnix, INVOICED_STATUSES]
      ),

      // 9. Top Lead Sources - grouped & counted, top 10
      query<{ source_name: string; count: string }>(
        `SELECT
           COALESCE(j.source_name, 'Unknown') AS source_name,
           COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND ${ACTIVE_REAL_JOB_WHERE}
         GROUP BY j.source_name
         ORDER BY count DESC
         LIMIT 10`,
        [startUnix, endUnix]
      ),

      // 10. Opportunities by Segment - pre-sale jobs created in period
      query<{ segment: string; count: string }>(
        `SELECT
           ${SEGMENT_SQL} AS segment,
           COUNT(*) AS count
         FROM jobs j
         WHERE ${ACTIVE_REAL_JOB_WHERE}
           AND j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND j.status_name IN ('Lead', 'New', 'Cold Lead', 'Appointment Scheduled', 'Estimating', 'Estimate Sent')
         GROUP BY segment
         ORDER BY count DESC`,
        [startUnix, endUnix]
      ),

      // 11. Sold Jobs by Segment - cohort close (jobs created in period that are currently converted)
      query<{ segment: string; count: string }>(
        `SELECT
           ${SEGMENT_SQL} AS segment,
           COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND ${ACTIVE_REAL_JOB_WHERE}
           AND j.status_name = ANY($3::text[])
         GROUP BY segment
         ORDER BY count DESC`,
        [startUnix, endUnix, CONVERTED_STATUSES]
      ),

      // 12. QuickBooks invoice revenue for the same period, when QBO sync is connected
      query<{ total: string; balance: string; count: string }>(
        `SELECT
           COALESCE(SUM(total_amount), 0)::text AS total,
           COALESCE(SUM(balance), 0)::text AS balance,
           COUNT(*)::text AS count
         FROM qbo_invoices
         WHERE txn_date >= $1::date
           AND txn_date < $2::date
           AND COALESCE(total_amount, 0) > 0`,
        [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)]
      ).catch(() => [{ total: "0", balance: "0", count: "0" }]),

      // 13. Sold This Period by Trade - first move to sold status in period, any vintage
      query<{ trade: string; jobs: string; value: string }>(
        `WITH first_sold AS (
           SELECT DISTINCT ON (h.job_jnid)
             h.job_jnid,
             h.changed_at
           FROM job_stage_history h
           WHERE h.to_stage_name IN ('Sold Job', 'Signed Contract', 'Sold Scope Prep')
             AND h.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago' >= $1
             AND h.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago' < $2
           ORDER BY h.job_jnid, h.changed_at ASC
         ),
         sold_jobs AS (
           SELECT
             j.jnid,
             j.cf_string_24,
             j.cf_string_25,
             j.cf_string_26,
             j.cf_string_27,
             j.record_type_name,
             COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), 0) AS estimate_value
           FROM first_sold fs
           JOIN jobs j ON j.jnid = fs.job_jnid
           WHERE ${ACTIVE_REAL_JOB_WHERE}
             AND j.record_type_name != 'Warranty'
         )
         SELECT
           'Roof' AS trade,
           COUNT(DISTINCT jnid) FILTER (WHERE cf_string_24 = '🏠 Y')::text AS jobs,
           COALESCE(SUM(DISTINCT estimate_value) FILTER (WHERE cf_string_24 = '🏠 Y'), 0)::text AS value
         FROM sold_jobs
         UNION ALL
         SELECT
           'Siding' AS trade,
           COUNT(DISTINCT jnid) FILTER (WHERE cf_string_25 = '🧱 Y')::text AS jobs,
           COALESCE(SUM(DISTINCT estimate_value) FILTER (WHERE cf_string_25 = '🧱 Y'), 0)::text AS value
         FROM sold_jobs
         UNION ALL
         SELECT
           'Gutters' AS trade,
           COUNT(DISTINCT jnid) FILTER (WHERE cf_string_26 = '💧Y')::text AS jobs,
           COALESCE(SUM(DISTINCT estimate_value) FILTER (WHERE cf_string_26 = '💧Y'), 0)::text AS value
         FROM sold_jobs
         UNION ALL
         SELECT
           'Windows' AS trade,
           COUNT(DISTINCT jnid) FILTER (WHERE cf_string_27 = '🪟 Y')::text AS jobs,
           COALESCE(SUM(DISTINCT estimate_value) FILTER (WHERE cf_string_27 = '🪟 Y'), 0)::text AS value
         FROM sold_jobs
         UNION ALL
         SELECT
           'Repairs' AS trade,
           COUNT(DISTINCT jnid) FILTER (WHERE record_type_name = 'Repairs')::text AS jobs,
           COALESCE(SUM(DISTINCT estimate_value) FILTER (WHERE record_type_name = 'Repairs'), 0)::text AS value
         FROM sold_jobs`,
        [range.start, range.end]
      ),

      // 14. Sold This Period by Segment - first move to sold status in period, any vintage
      query<{ segment: string; jobs: string; value: string }>(
        `WITH first_sold AS (
           SELECT DISTINCT ON (h.job_jnid)
             h.job_jnid,
             h.changed_at
           FROM job_stage_history h
           WHERE h.to_stage_name IN ('Sold Job', 'Signed Contract', 'Sold Scope Prep')
             AND h.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago' >= $1
             AND h.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago' < $2
           ORDER BY h.job_jnid, h.changed_at ASC
         )
         SELECT
           ${SEGMENT_SQL} AS segment,
           COUNT(DISTINCT j.jnid)::text AS jobs,
           COALESCE(SUM(COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), 0)), 0)::text AS value
         FROM first_sold fs
         JOIN jobs j ON j.jnid = fs.job_jnid
         WHERE ${ACTIVE_REAL_JOB_WHERE}
         GROUP BY segment
         ORDER BY jobs DESC`,
        [range.start, range.end]
      ),
    ]);

    // ── Process results ─────────────────────────────────────────────────

    // 1. Revenue
    const revenue = parseFloat(revenueRows[0]?.total ?? "0");

    // 2. Pipeline value
    const pipelineValue = parseFloat(pipelineRows[0]?.total ?? "0");
    const qboRevenue = Math.round((parseFloat(qboRevenueRows[0]?.total ?? "0") || 0) * 100) / 100;
    const qboInvoiceCount = parseInt(qboRevenueRows[0]?.count ?? "0", 10);
    const qboBalance = Math.round((parseFloat(qboRevenueRows[0]?.balance ?? "0") || 0) * 100) / 100;
    const qboRevenueVariance = Math.round((qboRevenue - revenue) * 100) / 100;

    // 3. New leads
    const newLeads = parseInt(newLeadsRows[0]?.count ?? "0", 10);

    // 4. Conversion rate
    const totalJobs = parseInt(conversionRows[0]?.total ?? "0", 10);
    const convertedJobs = parseInt(conversionRows[0]?.converted ?? "0", 10);
    const conversionRate = totalJobs > 0 ? (convertedJobs / totalJobs) * 100 : 0;

    // 5. Avg ticket
    const avgTicket = parseFloat(avgTicketRows[0]?.avg_ticket ?? "0");

    // 6. Revenue delta (percentage change from previous period)
    const prevRange = getPreviousDateRange(period);
    let revenueDelta: number | null = null;
    if (prevRange && previousRevenueRows[0]?.total !== null) {
      const previousRevenue = parseFloat(previousRevenueRows[0]?.total ?? "0");
      if (previousRevenue > 0) {
        revenueDelta = ((revenue - previousRevenue) / previousRevenue) * 100;
      } else if (revenue > 0) {
        revenueDelta = 100; // Went from $0 to some revenue
      }
    }

    // 7. Sales funnel - aggregate JN statuses into stages
    const stageCounts: Record<string, number> = {};
    for (const stage of STAGES) {
      stageCounts[stage] = 0;
    }
    for (const row of funnelRows) {
      const stage = STATUS_TO_STAGE[row.status_name];
      if (stage) {
        stageCounts[stage] += parseInt(row.count, 10);
      }
    }
    const salesFunnel = STAGES.map((stage, i) => ({
      name: stage,
      value: stageCounts[stage] ?? 0,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));

    // 8. Revenue by job type
    const revenueByJobType: Record<string, number> = {};
    for (const row of revenueByTypeRows) {
      revenueByJobType[row.record_type_name] = parseFloat(row.total);
    }

    // 9. Top lead sources
    const topLeadSources = leadSourceRows.map((row) => ({
      name: row.source_name,
      count: parseInt(row.count, 10),
    }));

    // 10. Opportunities by segment
    const opportunitiesBySegment: Record<string, number> = {};
    for (const row of opportunitiesBySegmentRows) {
      opportunitiesBySegment[row.segment] = parseInt(row.count, 10);
    }

    // 11. Sold jobs by segment (cohort close - created in period, currently converted)
    const soldJobsBySegment: Record<string, number> = {};
    for (const row of soldJobsBySegmentRows) {
      soldJobsBySegment[row.segment] = parseInt(row.count, 10);
    }

    // 13. Sold This Period by Trade (first sold in period, any vintage)
    const soldThisPeriodByTrade: Array<{ trade: string; jobs: number; value: number }> = [];
    let totalSoldThisPeriodJobs = 0;
    let totalSoldThisPeriodValue = 0;
    for (const row of soldThisPeriodByTradeRows) {
      const jobs = parseInt(row.jobs, 10);
      const value = parseFloat(row.value);
      if (jobs > 0) {
        soldThisPeriodByTrade.push({ trade: row.trade, jobs, value });
      }
    }
    // Calculate distinct total (need to re-query to get distinct count across all trades)
    // For now, sum the values as they're already using DISTINCT in the query
    totalSoldThisPeriodValue = soldThisPeriodByTrade.reduce((sum, t) => sum + t.value, 0);
    // Jobs might overlap across trades, so we need the total distinct count
    const totalSoldDistinctRows = await query<{ total_jobs: string; total_value: string }>(
      `WITH first_sold AS (
         SELECT DISTINCT ON (h.job_jnid)
           h.job_jnid,
           h.changed_at
         FROM job_stage_history h
         WHERE h.to_stage_name IN ('Sold Job', 'Signed Contract', 'Sold Scope Prep')
           AND h.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago' >= $1
           AND h.changed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago' < $2
         ORDER BY h.job_jnid, h.changed_at ASC
       )
       SELECT
         COUNT(DISTINCT j.jnid)::text AS total_jobs,
         COALESCE(SUM(DISTINCT COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), 0)), 0)::text AS total_value
       FROM first_sold fs
       JOIN jobs j ON j.jnid = fs.job_jnid
       WHERE ${ACTIVE_REAL_JOB_WHERE}
         AND j.record_type_name != 'Warranty'`,
      [range.start, range.end]
    );
    totalSoldThisPeriodJobs = parseInt(totalSoldDistinctRows[0]?.total_jobs ?? "0", 10);
    totalSoldThisPeriodValue = parseFloat(totalSoldDistinctRows[0]?.total_value ?? "0");

    // 14. Sold This Period by Segment
    const soldThisPeriodBySegment: Record<string, { jobs: number; value: number }> = {};
    for (const row of soldThisPeriodBySegmentRows) {
      soldThisPeriodBySegment[row.segment] = {
        jobs: parseInt(row.jobs, 10),
        value: parseFloat(row.value),
      };
    }

    // ── Leads delta (compare to previous period if available) ───────────
    let leadsDelta: number | null = null;
    if (prevRange) {
      const prevStartUnix = toUnixSeconds(prevRange.start);
      const prevEndUnix = toUnixSeconds(prevRange.end);
      const prevLeadsRows = await query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND ${ACTIVE_REAL_JOB_WHERE}`,
        [prevStartUnix, prevEndUnix]
      );
      const prevLeads = parseInt(prevLeadsRows[0]?.count ?? "0", 10);
      if (prevLeads > 0) {
        leadsDelta = ((newLeads - prevLeads) / prevLeads) * 100;
      } else if (newLeads > 0) {
        leadsDelta = 100;
      }
    }

    // ── Assemble response ───────────────────────────────────────────────
    const dashboard = {
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      revenue,
      qboRevenue,
      qboInvoiceCount,
      qboBalance,
      qboRevenueVariance,
      pipelineValue,
      newLeads,
      conversionRate: Math.round(conversionRate * 10) / 10,
      avgTicket: Math.round(avgTicket * 100) / 100,
      revenueDelta: revenueDelta !== null ? Math.round(revenueDelta * 10) / 10 : null,
      leadsDelta: leadsDelta !== null ? Math.round(leadsDelta * 10) / 10 : null,
      salesFunnel,
      revenueByJobType,
      topLeadSources,
      opportunitiesBySegment,
      soldJobsBySegment,
      soldThisPeriod: {
        totalJobs: totalSoldThisPeriodJobs,
        totalValue: Math.round(totalSoldThisPeriodValue * 100) / 100,
        byTrade: soldThisPeriodByTrade.map(t => ({
          trade: t.trade,
          jobs: t.jobs,
          value: Math.round(t.value * 100) / 100,
        })),
        bySegment: soldThisPeriodBySegment,
      },
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN';

    console.error("[Dashboard API] Error caught");
    console.error("[Dashboard API] Error message:", errorMsg);
    console.error("[Dashboard API] Error code:", errorCode);
    if (error instanceof Error) {
      console.error("[Dashboard API] Error stack:", error.stack);
    }

    // Return detailed error for debugging
    return NextResponse.json(
      {
        error: "Failed to fetch dashboard metrics",
        details: errorMsg,
        code: errorCode,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
