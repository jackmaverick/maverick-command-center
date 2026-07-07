import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, isValidPeriodKey, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import { LOSS_STATUSES } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

// ── Constants ────────────────────────────────────────────────────────────────


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

const INVOICED_STATUSES = ["Sent", "Open", "Closed"];
const ACTIVE_REAL_JOB_WHERE = `
  j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;
const EFFECTIVE_INVOICE_DATE = "COALESCE(i.date_invoice, i.jn_date_created)";

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

interface CampaignCostRow {
  source_name: string;
  cost: string;
}

interface MarketingExpenseRow {
  name: string;
  amount: string;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface SourcePerformance {
  source: string;
  totalLeads: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  revenue: number;
  avgTicket: number;
  acquisitionCost: number;
  exactCost: number;
  allocatedCost: number;
  costPerLead: number | null;
  cac: number | null;
  roas: number | null;
  costBasis: "exact" | "allocated" | "mixed" | "none";
  segmentBreakdown: Record<Segment, number>;
}

const PAID_SOURCE_PATTERNS = [
  /direct mail/i,
  /\blsa\b/i,
  /google/i,
  /website/i,
  /roofle/i,
  /yard sign/i,
];

function isPaidAcquisitionSource(source: string): boolean {
  return PAID_SOURCE_PATTERNS.some((pattern) => pattern.test(source));
}

function sourceNameForChannel(channel: string | null): string {
  const normalized = (channel ?? "").trim().toLowerCase();
  if (normalized === "direct_mail" || normalized === "direct mail") return "Direct Mail";
  if (normalized === "lsa" || normalized === "local services ads") return "LSA";
  if (normalized.includes("google")) return "Google Search";
  if (normalized.includes("website")) return "Website";
  return normalized ? normalized.replace(/_/g, " ") : "Unknown";
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function monthlyEquivalent(amount: number, frequency: string | null): number {
  switch ((frequency ?? "monthly").toLowerCase()) {
    case "weekly":
      return amount * 52 / 12;
    case "biweekly":
      return amount * 26 / 12;
    case "quarterly":
      return amount / 3;
    case "annual":
    case "annually":
    case "yearly":
      return amount / 12;
    case "daily":
      return amount * 30;
    case "monthly":
    default:
      return amount;
  }
}

function prorateRecurringExpense(row: MarketingExpenseRow, rangeStart: Date, rangeEnd: Date): number {
  const expenseStart = row.start_date ? new Date(`${row.start_date}T00:00:00`) : rangeStart;
  const expenseEnd = row.end_date ? new Date(`${row.end_date}T00:00:00`) : rangeEnd;
  const overlapStart = new Date(Math.max(rangeStart.getTime(), expenseStart.getTime()));
  const overlapEnd = new Date(Math.min(rangeEnd.getTime(), expenseEnd.getTime()));
  const overlapDays = daysBetween(overlapStart, overlapEnd);
  if (overlapDays <= 0) return 0;

  const monthly = monthlyEquivalent(parseFloat(row.amount), row.frequency);
  return (monthly * overlapDays) / 30;
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse & validate period
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = isValidPeriodKey(periodParam) ? periodParam : "month";
    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    // ── Run all queries in parallel ──────────────────────────────────────

    const [
      sourceRows,
      revenueRows,
      segmentRows,
      campaignCostRows,
      lsaCostRows,
      recurringMarketingRows,
      oneTimeMarketingRows,
    ] = await Promise.all([
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
           AND ${ACTIVE_REAL_JOB_WHERE}
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
           AND ${ACTIVE_REAL_JOB_WHERE}
           AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
           AND ${EFFECTIVE_INVOICE_DATE} >= $1
           AND ${EFFECTIVE_INVOICE_DATE} < $2
         GROUP BY COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown')`,
        [startUnix, endUnix, INVOICED_STATUSES]
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
           AND ${ACTIVE_REAL_JOB_WHERE}
         GROUP BY COALESCE(NULLIF(TRIM(j.source_name), ''), 'Unknown'),
                  (${SEGMENT_SQL})`,
        [startUnix, endUnix]
      ),

      query<CampaignCostRow>(
        `SELECT
           channel AS source_name,
           COALESCE(SUM(total_cost), 0)::text AS cost
         FROM marketing_campaigns
         WHERE send_date >= $1::date
           AND send_date < $2::date
         GROUP BY channel`,
        [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)]
      ).catch(() => []),

      query<CampaignCostRow>(
        `SELECT
           'LSA' AS source_name,
           COALESCE(SUM(cost_usd), 0)::text AS cost
         FROM lsa_leads
         WHERE COALESCE(event_at, received_at, created_at) >= $1::timestamptz
           AND COALESCE(event_at, received_at, created_at) < $2::timestamptz`,
        [range.start.toISOString(), range.end.toISOString()]
      ).catch(() => []),

      query<MarketingExpenseRow>(
        `SELECT name, amount::text, frequency, start_date::text, end_date::text
         FROM app_recurring_expenses
         WHERE category ILIKE 'Marketing'
           AND start_date < $2::date
           AND (end_date IS NULL OR end_date >= $1::date)`,
        [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)]
      ).catch(() => []),

      query<{ amount: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS amount
         FROM app_one_time_expenses
         WHERE category ILIKE 'Marketing'
           AND expected_date >= $1::date
           AND expected_date < $2::date`,
        [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)]
      ).catch(() => [{ amount: "0" }]),
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

    const exactCostBySource: Record<string, number> = {};
    for (const row of campaignCostRows) {
      const source = sourceNameForChannel(row.source_name);
      exactCostBySource[source] = round2((exactCostBySource[source] ?? 0) + parseFloat(row.cost));
    }
    for (const row of lsaCostRows) {
      exactCostBySource[row.source_name] = round2(
        (exactCostBySource[row.source_name] ?? 0) + parseFloat(row.cost)
      );
    }

    const recurringMarketingCost = recurringMarketingRows.reduce(
      (sum, row) => sum + prorateRecurringExpense(row, range.start, range.end),
      0
    );
    const oneTimeMarketingCost = parseFloat(oneTimeMarketingRows[0]?.amount ?? "0");
    const exactMarketingCost = Object.values(exactCostBySource).reduce((sum, cost) => sum + cost, 0);
    const totalMarketingBudget = round2(recurringMarketingCost + oneTimeMarketingCost + exactMarketingCost);

    // ── Assemble source performance table ────────────────────────────────

    const paidLeadTotal = sourceRows.reduce((sum, row) => {
      return isPaidAcquisitionSource(row.source_name)
        ? sum + parseInt(row.total_leads, 10)
        : sum;
    }, 0);

    const sources: SourcePerformance[] = sourceRows.map((row) => {
      const totalLeads = parseInt(row.total_leads, 10);
      const wonJobs = parseInt(row.won_jobs, 10);
      const lostJobs = parseInt(row.lost_jobs, 10);
      const closeRate = totalLeads > 0 ? round1((wonJobs / totalLeads) * 100) : 0;
      const revenue = round2(revenueBySource[row.source_name] ?? 0);
      const avgTicket = wonJobs > 0 ? round2(revenue / wonJobs) : 0;
      const exactCost = round2(exactCostBySource[row.source_name] ?? 0);
      const allocatedCost = isPaidAcquisitionSource(row.source_name) && paidLeadTotal > 0
        ? round2(((recurringMarketingCost + oneTimeMarketingCost) * totalLeads) / paidLeadTotal)
        : 0;
      const acquisitionCost = round2(exactCost + allocatedCost);
      const costBasis = exactCost > 0 && allocatedCost > 0
        ? "mixed"
        : exactCost > 0
          ? "exact"
          : allocatedCost > 0
            ? "allocated"
            : "none";

      return {
        source: row.source_name,
        totalLeads,
        wonJobs,
        lostJobs,
        closeRate,
        revenue,
        avgTicket,
        acquisitionCost,
        exactCost,
        allocatedCost,
        costPerLead: totalLeads > 0 && acquisitionCost > 0 ? round2(acquisitionCost / totalLeads) : null,
        cac: wonJobs > 0 && acquisitionCost > 0 ? round2(acquisitionCost / wonJobs) : null,
        roas: acquisitionCost > 0 ? round2(revenue / acquisitionCost) : null,
        costBasis,
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
    const paidSources = sources.filter((source) => source.acquisitionCost > 0);
    const totalAcquisitionCost = round2(
      paidSources.reduce((sum, source) => sum + source.acquisitionCost, 0)
    );
    const paidLeads = paidSources.reduce((sum, source) => sum + source.totalLeads, 0);
    const paidWonJobs = paidSources.reduce((sum, source) => sum + source.wonJobs, 0);
    const paidRevenue = round2(paidSources.reduce((sum, source) => sum + source.revenue, 0));

    // ── Return response ──────────────────────────────────────────────────

    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      sources,
      acquisition: {
        totalCost: totalAcquisitionCost,
        recurringMarketingCost: round2(recurringMarketingCost),
        oneTimeMarketingCost: round2(oneTimeMarketingCost),
        exactMarketingCost: round2(exactMarketingCost),
        paidLeads,
        paidWonJobs,
        paidRevenue,
        blendedCac: paidWonJobs > 0 && totalAcquisitionCost > 0
          ? round2(totalAcquisitionCost / paidWonJobs)
          : null,
        costPerLead: paidLeads > 0 && totalAcquisitionCost > 0
          ? round2(totalAcquisitionCost / paidLeads)
          : null,
        roas: totalAcquisitionCost > 0 ? round2(paidRevenue / totalAcquisitionCost) : null,
        totalMarketingBudget,
        missingExactCostSources: sources
          .filter((source) => isPaidAcquisitionSource(source.source) && source.exactCost === 0 && source.totalLeads > 0)
          .map((source) => source.source),
      },
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

  // Calculate overall average close rate against total lead volume.
  const totalWon = sources.reduce((s, r) => s + r.wonJobs, 0);
  const totalLeads = sources.reduce((s, r) => s + r.totalLeads, 0);
  const overallCloseRate = totalLeads > 0 ? round1((totalWon / totalLeads) * 100) : 0;

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

  const cacSources = sources
    .filter((s) => s.cac !== null)
    .sort((a, b) => (a.cac ?? Number.MAX_SAFE_INTEGER) - (b.cac ?? Number.MAX_SAFE_INTEGER));
  if (cacSources.length > 0) {
    const bestCac = cacSources[0];
    insights.push(
      `${bestCac.source} has the lowest measured CAC at $${bestCac.cac!.toLocaleString("en-US", { maximumFractionDigits: 0 })} per won job`
    );
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
