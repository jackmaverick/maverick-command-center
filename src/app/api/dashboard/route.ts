import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import { STATUS_TO_STAGE, STAGES, CHART_COLORS } from "@/lib/constants";

// Valid period keys for input validation
const VALID_PERIODS: PeriodKey[] = [
  "week",
  "last_week",
  "month",
  "last_month",
  "quarter",
  "ytd",
  "all",
];

// Statuses that count as "converted" (Sold or later)
const CONVERTED_STATUSES = Object.entries(STATUS_TO_STAGE)
  .filter(([, stage]) => {
    const stageIndex = STAGES.indexOf(stage);
    const soldIndex = STAGES.indexOf("Sold");
    return stageIndex >= soldIndex;
  })
  .map(([status]) => status);

/**
 * Compute the "previous" period for delta comparison.
 * E.g. if current period is "month", previous period is "last_month".
 */
function getPreviousPeriodKey(period: PeriodKey): PeriodKey | null {
  switch (period) {
    case "week":
      return "last_week";
    case "month":
      return "last_month";
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;

    // Validate period
    const period = VALID_PERIODS.includes(periodParam) ? periodParam : "month";
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
      activityRows,
      pipelineBySegmentRows,
    ] = await Promise.all([
      // 1. YTD Revenue (accrual basis - uses date_invoice BIGINT)
      query<{ total: string }>(
        `SELECT COALESCE(SUM(i.total), 0) AS total
         FROM invoices i
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice < $2`,
        [startUnix, endUnix]
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
           AND j.status_name IN (
             'Estimating', 'Estimate Sent', 'Sold Job',
             'Production Ready', 'In Progress',
             'Insurance Pending', 'Invoiced'
           )`,
        []
      ),

      // 3. New Leads - jobs created in period (jn_date_created is BIGINT)
      query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2`,
        [startUnix, endUnix]
      ),

      // 4. Conversion Rate - jobs that reached 'Sold Job' or later / total in period
      query<{ total: string; converted: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (
             WHERE j.status_name = ANY($3::text[])
           ) AS converted
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2`,
        [startUnix, endUnix, CONVERTED_STATUSES]
      ),

      // 5. Avg Ticket - average invoice total for invoiced jobs in period
      query<{ avg_ticket: string }>(
        `SELECT COALESCE(AVG(i.total), 0) AS avg_ticket
         FROM invoices i
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice < $2
           AND i.total > 0`,
        [startUnix, endUnix]
      ),

      // 6. Previous period revenue (for delta calculation)
      (() => {
        const prevKey = getPreviousPeriodKey(period);
        if (!prevKey) {
          return Promise.resolve([{ total: null }] as { total: string | null }[]);
        }
        const prevRange = getDateRange(prevKey);
        const prevStartUnix = toUnixSeconds(prevRange.start);
        const prevEndUnix = toUnixSeconds(prevRange.end);
        return query<{ total: string | null }>(
          `SELECT COALESCE(SUM(i.total), 0) AS total
           FROM invoices i
           WHERE i.is_active = true
             AND i.date_invoice >= $1
             AND i.date_invoice < $2`,
          [prevStartUnix, prevEndUnix]
        );
      })(),

      // 7. Sales Funnel - count jobs at each major stage
      query<{ status_name: string; count: string }>(
        `SELECT j.status_name, COUNT(*) AS count
         FROM jobs j
         WHERE j.is_active = true
           AND j.is_archived = false
           AND j.status_name IS NOT NULL
         GROUP BY j.status_name`,
        []
      ),

      // 8. Revenue by Job Type (record_type_name)
      query<{ record_type_name: string; total: string }>(
        `SELECT
           COALESCE(j.record_type_name, 'Unknown') AS record_type_name,
           COALESCE(SUM(i.total), 0) AS total
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice < $2
         GROUP BY j.record_type_name
         ORDER BY total DESC`,
        [startUnix, endUnix]
      ),

      // 9. Top Lead Sources - grouped & counted, top 10
      query<{ source_name: string; count: string }>(
        `SELECT
           COALESCE(j.source_name, 'Unknown') AS source_name,
           COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
         GROUP BY j.source_name
         ORDER BY count DESC
         LIMIT 10`,
        [startUnix, endUnix]
      ),

      // 10. Recent Activity - last 10 by activity_date
      query<{
        id: string;
        activity_type_code: string;
        subject: string | null;
        content: string | null;
        contact_jnid: string | null;
        job_jnid: string | null;
        activity_date: string;
        performed_by_name: string | null;
      }>(
        `SELECT
           a.id,
           a.activity_type_code,
           a.subject,
           a.content,
           a.contact_jnid,
           a.job_jnid,
           a.activity_date,
           a.performed_by_name
         FROM activities a
         ORDER BY a.activity_date DESC
         LIMIT 10`,
        []
      ),

      // 11. Pipeline by Segment - active jobs grouped by computed segment
      query<{ segment: string; count: string }>(
        `SELECT
           ${SEGMENT_SQL} AS segment,
           COUNT(*) AS count
         FROM jobs j
         WHERE j.is_active = true
           AND j.is_archived = false
           AND j.is_closed = false
         GROUP BY segment
         ORDER BY count DESC`,
        []
      ),
    ]);

    // ── Process results ─────────────────────────────────────────────────

    // 1. Revenue
    const revenue = parseFloat(revenueRows[0]?.total ?? "0");

    // 2. Pipeline value
    const pipelineValue = parseFloat(pipelineRows[0]?.total ?? "0");

    // 3. New leads
    const newLeads = parseInt(newLeadsRows[0]?.count ?? "0", 10);

    // 4. Conversion rate
    const totalJobs = parseInt(conversionRows[0]?.total ?? "0", 10);
    const convertedJobs = parseInt(conversionRows[0]?.converted ?? "0", 10);
    const conversionRate = totalJobs > 0 ? (convertedJobs / totalJobs) * 100 : 0;

    // 5. Avg ticket
    const avgTicket = parseFloat(avgTicketRows[0]?.avg_ticket ?? "0");

    // 6. Revenue delta (percentage change from previous period)
    let revenueDelta: number | null = null;
    const prevKey = getPreviousPeriodKey(period);
    if (prevKey && previousRevenueRows[0]?.total !== null) {
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

    // 10. Recent activity
    const recentActivity = activityRows.map((row) => ({
      id: row.id,
      type: row.activity_type_code,
      subject: row.subject,
      description: row.content,
      contact_id: row.contact_jnid,
      job_id: row.job_jnid,
      date_created: row.activity_date,
      performed_by: row.performed_by_name,
      source: "jn" as const,
    }));

    // 11. Pipeline by segment
    const pipelineBySegment: Record<string, number> = {};
    for (const row of pipelineBySegmentRows) {
      pipelineBySegment[row.segment] = parseInt(row.count, 10);
    }

    // ── Leads delta (compare to previous period if available) ───────────
    let leadsDelta: number | null = null;
    if (prevKey) {
      const prevRange = getDateRange(prevKey);
      const prevStartUnix = toUnixSeconds(prevRange.start);
      const prevEndUnix = toUnixSeconds(prevRange.end);
      const prevLeadsRows = await query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2`,
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
      pipelineValue,
      newLeads,
      conversionRate: Math.round(conversionRate * 10) / 10,
      avgTicket: Math.round(avgTicket * 100) / 100,
      revenueDelta: revenueDelta !== null ? Math.round(revenueDelta * 10) / 10 : null,
      leadsDelta: leadsDelta !== null ? Math.round(leadsDelta * 10) / 10 : null,
      salesFunnel,
      revenueByJobType,
      topLeadSources,
      recentActivity,
      pipelineBySegment,
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[Dashboard API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard metrics" },
      { status: 500 }
    );
  }
}
