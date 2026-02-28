import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL, segmentWhereClause } from "@/lib/segment";
import { STATUS_CONVERSIONS, LOSS_STATUSES } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

const VALID_PERIODS: PeriodKey[] = [
  "week", "last_week", "month", "last_month", "quarter", "ytd", "all",
];

const VALID_SEGMENTS: Segment[] = [
  "real_estate", "retail", "insurance", "repairs", "warranty",
];

// Jobs are won when they reach "Sold Job"
const WON_STATUSES = ["Sold Job", "Production Ready", "In Progress", "Insurance Pending", "Future Work", "Needs Rescheduling", "Invoiced", "Final Invoicing", "Pending Final Payment", "Job Close Out", "Paid & Closed", "All Work Completed", "All Work Complete", "Job Completed", "Warranty Complete"];

const FOLLOWUP_TYPES = ["note", "call", "email", "text"];

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "month") as PeriodKey;
    const segment = (searchParams.get("segment") as Segment | null) || null;
    const repJnid = searchParams.get("rep_jnid") || null;

    // Validate inputs
    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    if (segment && !VALID_SEGMENTS.includes(segment)) {
      return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
    }

    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    const filter = buildJobFilter(startUnix, endUnix, segment, repJnid);

    // Get all reps
    const repsRows = await query<{ sales_rep_jnid: string; sales_rep_name: string }>(
      `SELECT DISTINCT sales_rep_jnid, sales_rep_name 
       FROM jobs j
       WHERE ${filter.where}
       ORDER BY sales_rep_name`,
      filter.params
    );

    const reps = repsRows.filter((r) => r.sales_rep_jnid && r.sales_rep_name);

    // Calculate per-rep metrics
    const repMetrics = await Promise.all(
      reps.map(async (rep) => {
        const repFilter = buildJobFilter(startUnix, endUnix, segment, rep.sales_rep_jnid);

        // Total jobs
        const totalRes = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM jobs j WHERE ${repFilter.where}`,
          repFilter.params
        );
        const totalJobs = parseInt(totalRes[0]?.count ?? "0", 10);

        // Won jobs (reached Sold Job or beyond)
        const wonRes = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM jobs j 
           WHERE ${repFilter.where} AND j.status_name = ANY($${repFilter.nextIdx}::text[])`,
          [...repFilter.params, WON_STATUSES]
        );
        const wonJobs = parseInt(wonRes[0]?.count ?? "0", 10);

        // Lost jobs
        const lostRes = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM jobs j 
           WHERE ${repFilter.where} AND j.status_name = ANY($${repFilter.nextIdx}::text[])`,
          [...repFilter.params, LOSS_STATUSES]
        );
        const lostJobs = parseInt(lostRes[0]?.count ?? "0", 10);

        const closeRate = totalJobs > 0 ? (wonJobs / totalJobs) * 100 : 0;

        // Segment breakdown (close rate by segment)
        const segmentBreakdown: Record<string, number> = {};
        for (const seg of VALID_SEGMENTS) {
          const segFilter = buildJobFilter(startUnix, endUnix, seg, rep.sales_rep_jnid);
          const segTotal = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM jobs j WHERE ${segFilter.where}`,
            segFilter.params
          );
          const segTotalCount = parseInt(segTotal[0]?.count ?? "0", 10);

          if (segTotalCount > 0) {
            const segWon = await query<{ count: string }>(
              `SELECT COUNT(*) as count FROM jobs j 
               WHERE ${segFilter.where} AND j.status_name = ANY($${segFilter.nextIdx}::text[])`,
              [...segFilter.params, WON_STATUSES]
            );
            const segWonCount = parseInt(segWon[0]?.count ?? "0", 10);
            segmentBreakdown[seg] = round1((segWonCount / segTotalCount) * 100);
          } else {
            segmentBreakdown[seg] = 0;
          }
        }

        // Revenue: sum of invoices on this rep's jobs in the period
        const revenueRes = await query<{ total: string }>(
          `SELECT COALESCE(SUM(i.total), 0) as total
           FROM invoices i
           JOIN jobs j ON j.jnid = i.job_jnid
           WHERE ${repFilter.where} AND i.is_active = true`,
          repFilter.params
        );
        const revenue = round2(parseFloat(revenueRes[0]?.total ?? "0"));

        return {
          repId: rep.sales_rep_jnid,
          repName: rep.sales_rep_name,
          totalJobs: totalJobs,
          wonJobs: wonJobs,
          lostJobs: lostJobs,
          closeRate: round1(closeRate),
          segmentCloseRates: segmentBreakdown,
          revenue,
          avgCycleDays: 0, // Would require status history tracking
          statusConversions: [],
          followUpMetrics: { avgAfterEstimate: 0, avgAfterAppointment: 0, jobsWithZeroFollowUp: 0 },
          timeBetweenStatuses: [],
        };
      })
    );

    // Sort by close rate descending
    repMetrics.sort((a, b) => b.closeRate - a.closeRate);

    // Build summary
    const totalJobs = repMetrics.reduce((s, r) => s + r.totalJobs, 0);
    const totalWon = repMetrics.reduce((s, r) => s + r.wonJobs, 0);
    const totalRevenue = repMetrics.reduce((s, r) => s + r.revenue, 0);
    const closeRates = repMetrics.filter((r) => r.totalJobs > 0).map((r) => r.closeRate);
    const avgCloseRate = closeRates.length > 0
      ? round1(closeRates.reduce((s, r) => s + r, 0) / closeRates.length)
      : 0;
    const cycleTimes = repMetrics.filter((r) => r.avgCycleDays > 0).map((r) => r.avgCycleDays);
    const avgCycleTimeDays = cycleTimes.length > 0
      ? round1(cycleTimes.reduce((s, r) => s + r, 0) / cycleTimes.length)
      : 0;

    return NextResponse.json({
      period: { key: period, label: range.label },
      filters: { segment, rep: repJnid },
      summary: {
        totalRevenue,
        avgCloseRate,
        avgCycleTimeDays,
        activeReps: repMetrics.length,
        totalJobs,
        totalWon,
      },
      reps: repMetrics,
    });
  } catch (error) {
    console.error("Sales API error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
