import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import { LOSS_STATUSES } from "@/lib/constants";
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

/** Jobs are won when they reach "Sold Job" status or beyond. */
const WON_STATUSES = [
  "Sold Job",
  "Production Ready",
  "In Progress",
  "Insurance Pending",
  "Future Work",
  "Needs Rescheduling",
  "Invoiced",
  "Final Invoicing",
  "Pending Final Payment",
  "Job Close Out",
  "Paid & Closed",
  "All Work Completed",
  "All Work Complete",
  "Job Completed",
  "Warranty Complete",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SourceRow {
  source_name: string;
  total_leads: string;
  won_jobs: string;
  lost_jobs: string;
}

interface SourceRevenueRow {
  source_name: string;
  revenue: string;
}

interface SourceSegmentRow {
  source_name: string;
  segment: string;
  count: string;
}

interface SourcePerformance {
  source: string;
  totalLeads: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  revenue: number;
  avgTicket: number;
  segmentBreakdown: Record<Segment, number>;
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse & validate period
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = VALID_PERIODS.includes(periodParam) ? periodParam : "month";
    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    // ── Run all queries in parallel ──────────────────────────────────────

    const [sourceRows, revenueRows, segmentRows] = await Promise.all([
      // 1. Source performance: leads, won, lost per source
      // $1=start, $2=end, $3=WON_STATUSES, $4=LOSS_STATUSES
      query<SourceRow>(
        `SELECT
           COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown') AS source_name,
           COUNT(*)::text AS total_leads,
           COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]))::text AS won_jobs,
           COUNT(*) FILTER (WHERE j.status_name = ANY($4::text[]))::text AS lost_jobs
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
         GROUP BY COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown')
         ORDER BY COUNT(*) DESC`,
        [startUnix, endUnix, [...WON_STATUSES], [...LOSS_STATUSES]]
      ),

      // 2. Revenue per source (accrual basis via invoices.date_invoice)
      // $1=start, $2=end
      query<SourceRevenueRow>(
        `SELECT
           COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown') AS source_name,
           COALESCE(SUM(i.total), 0)::text AS revenue
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice < $2
         GROUP BY COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown')`,
        [startUnix, endUnix]
      ),

      // 3. Source x Segment cross-tab
      // $1=start, $2=end
      query<SourceSegmentRow>(
        `SELECT
           COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown') AS source_name,
           (${SEGMENT_SQL}) AS segment,
           COUNT(*)::text AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
         GROUP BY COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown'),
                  (${SEGMENT_SQL})`,
        [startUnix, endUnix]
      ),
    ]);

    // ── Build revenue lookup ─────────────────────────────────────────────

    const revenueBySource: Record<string, number> = {};
    for (const row of revenueRows) {
      revenueBySource[row.source_name] = parseFloat(row.revenue);
    }

    // ── Build segment breakdown lookup ───────────────────────────────────

    const segmentBySource: Record<string, Record<Segment, number>> = {};
    for (const row of segmentRows) {
      if (!segmentBySource[row.source_name]) {
        segmentBySource[row.source_name] = {
          real_estate: 0,
          retail: 0,
          insurance: 0,
          repairs: 0,
          warranty: 0,
        };
      }
      segmentBySource[row.source_name][row.segment as Segment] = parseInt(
        row.count,
        10
      );
    }

    // ── Assemble source performance table ────────────────────────────────

    const sources: SourcePerformance[] = sourceRows.map((row) => {
      const totalLeads = parseInt(row.total_leads, 10);
      const wonJobs = parseInt(row.won_jobs, 10);
      const lostJobs = parseInt(row.lost_jobs, 10);
      const decided = wonJobs + lostJobs;
      const closeRate = decided > 0 ? round1((wonJobs / decided) * 100) : 0;
      const revenue = round2(revenueBySource[row.source_name] ?? 0);
      const avgTicket = wonJobs > 0 ? round2(revenue / wonJobs) : 0;

      return {
        source: row.source_name,
        totalLeads,
        wonJobs,
        lostJobs,
        closeRate,
        revenue,
        avgTicket,
        segmentBreakdown: segmentBySource[row.source_name] ?? {
          real_estate: 0,
          retail: 0,
          insurance: 0,
          repairs: 0,
          warranty: 0,
        },
      };
    });

    // ── Top sources summary ──────────────────────────────────────────────

    // Top 5 by lead volume (already sorted desc by total_leads from SQL)
    const topByVolume = sources.slice(0, 5).map((s) => ({
      source: s.source,
      totalLeads: s.totalLeads,
    }));

    // Top 5 by close rate (min 5 leads to qualify)
    const topByCloseRate = [...sources]
      .filter((s) => s.totalLeads >= 5)
      .sort((a, b) => b.closeRate - a.closeRate)
      .slice(0, 5)
      .map((s) => ({
        source: s.source,
        closeRate: s.closeRate,
        totalLeads: s.totalLeads,
      }));

    // ── Auto-insights ────────────────────────────────────────────────────

    const insights = generateInsights(sources);

    // ── Return response ──────────────────────────────────────────────────

    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      sources,
      topSources: {
        byVolume: topByVolume,
        byCloseRate: topByCloseRate,
      },
      insights,
    });
  } catch (error) {
    console.error("[Lead Sources API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lead source metrics" },
      { status: 500 }
    );
  }
}

// ── Insight generation ───────────────────────────────────────────────────────

function generateInsights(sources: SourcePerformance[]): string[] {
  const insights: string[] = [];

  if (sources.length === 0) return insights;

  // Calculate overall average close rate (across all sources with decisions)
  const totalWon = sources.reduce((s, r) => s + r.wonJobs, 0);
  const totalLost = sources.reduce((s, r) => s + r.lostJobs, 0);
  const totalDecided = totalWon + totalLost;
  const overallCloseRate =
    totalDecided > 0 ? round1((totalWon / totalDecided) * 100) : 0;

  // Highest volume source
  const topVolume = sources[0]; // already sorted desc by total_leads
  if (topVolume) {
    if (topVolume.closeRate < overallCloseRate) {
      insights.push(
        `${topVolume.source} generates the most leads (${topVolume.totalLeads}) but converts at only ${topVolume.closeRate}%`
      );
    } else {
      insights.push(
        `${topVolume.source} leads with ${topVolume.totalLeads} leads and a ${topVolume.closeRate}% close rate`
      );
    }
  }

  // Sources with significantly higher close rate than average (min 5 leads)
  const qualifiedSources = sources.filter((s) => s.totalLeads >= 5);
  for (const src of qualifiedSources) {
    if (overallCloseRate > 0 && src.closeRate >= overallCloseRate * 1.5) {
      const multiplier = round1(src.closeRate / overallCloseRate);
      insights.push(
        `${src.source} closes at ${src.closeRate}% — ${multiplier}x the average`
      );
    }
  }

  // Sources with significantly lower close rate than average (min 5 leads)
  for (const src of qualifiedSources) {
    if (
      overallCloseRate > 0 &&
      src.closeRate < overallCloseRate * 0.5 &&
      src !== topVolume // skip if already mentioned as top volume
    ) {
      insights.push(
        `${src.source} converts at only ${src.closeRate}% — below the ${overallCloseRate}% average`
      );
    }
  }

  // Highest revenue source
  const topRevenue = [...sources].sort((a, b) => b.revenue - a.revenue)[0];
  if (
    topRevenue &&
    topRevenue.revenue > 0 &&
    topRevenue.source !== topVolume?.source
  ) {
    insights.push(
      `${topRevenue.source} drives the most revenue ($${topRevenue.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}) despite ranking #${sources.indexOf(topRevenue) + 1} in lead volume`
    );
  }

  // Highest avg ticket source (min 3 won jobs)
  const highTicketSources = sources.filter((s) => s.wonJobs >= 3);
  if (highTicketSources.length > 0) {
    const topTicket = [...highTicketSources].sort(
      (a, b) => b.avgTicket - a.avgTicket
    )[0];
    const overallAvgTicket =
      totalWon > 0
        ? round2(
            sources.reduce((s, r) => s + r.revenue, 0) / totalWon
          )
        : 0;
    if (
      topTicket &&
      topTicket.avgTicket > overallAvgTicket * 1.3 &&
      overallAvgTicket > 0
    ) {
      insights.push(
        `${topTicket.source} has the highest avg ticket at $${topTicket.avgTicket.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${round1((topTicket.avgTicket / overallAvgTicket - 1) * 100)}% above average)`
      );
    }
  }

  // Zero-conversion warning for high-volume sources (10+ leads, 0% close rate)
  for (const src of sources) {
    if (src.totalLeads >= 10 && src.wonJobs === 0) {
      insights.push(
        `${src.source} has ${src.totalLeads} leads but zero wins — review lead quality`
      );
    }
  }

  return insights;
}
