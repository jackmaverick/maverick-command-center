import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getDateRange, isValidPeriodKey, type PeriodKey } from "@/lib/dates";
import { SEGMENT_SQL, segmentWhereClause } from "@/lib/segment";
import { TRADE_CF_YES_VALUES } from "@/lib/constants";
import type { Segment, TradeFilter } from "@/lib/constants";

export const dynamic = "force-dynamic";

const VALID_SEGMENTS: Segment[] = [
  "real_estate",
  "retail",
  "insurance",
  "repairs",
  "warranty",
];

type RepCoreRow = {
  rep_id: string;
  rep_name: string;
  total_jobs: string;
  sold_jobs: string;
  lost_jobs: string;
  fallback_jobs: string;
};

type RepRevenueRow = {
  rep_id: string;
  revenue: string;
};

type RepSegmentRow = {
  rep_id: string;
  segment: Segment;
  total_jobs: string;
  sold_jobs: string;
};

function buildTradeFilter(trade: TradeFilter): string {
  if (trade === "all") return "";
  if (trade === "none") {
    return `AND (${Object.entries(TRADE_CF_YES_VALUES)
      .map(
        ([field, yesValue]) =>
          `j.${field} IS DISTINCT FROM '${yesValue.replace(/'/g, "''")}'`
      )
      .join(" AND ")})`;
  }

  const tradeMap = {
    roof: { field: "cf_string_24", value: "🏠 Y" },
    gutters: { field: "cf_string_26", value: "💧Y" },
    windows: { field: "cf_string_27", value: "🪟 Y" },
  } as const;
  const config = tradeMap[trade as keyof typeof tradeMap];
  return config
    ? `AND j.${config.field} = '${config.value.replace(/'/g, "''")}'`
    : "";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPeriod = searchParams.get("period") ?? "reference";
    if (!isValidPeriodKey(requestedPeriod)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }
    const period = requestedPeriod as PeriodKey;
    const segment = (searchParams.get("segment") as Segment | null) || null;
    const repJnid = searchParams.get("rep_jnid") || null;
    const tradeParam = searchParams.get("trade") || searchParams.get("roofOnly");
    const trade: TradeFilter =
      tradeParam === "1" || tradeParam === "true"
        ? "roof"
        : ["all", "none", "roof", "gutters", "windows"].includes(
              tradeParam || ""
            )
          ? (tradeParam as TradeFilter)
          : "all";

    if (segment && !VALID_SEGMENTS.includes(segment)) {
      return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
    }

    const range = getDateRange(period);
    const conditions = [
      "sales_job.created_at >= $1::timestamptz",
      "sales_job.created_at < $2::timestamptz",
    ];
    const params: unknown[] = [range.start.toISOString(), range.end.toISOString()];
    let index = 3;

    if (segment) {
      conditions.push(segmentWhereClause(index));
      params.push(segment);
      index++;
    }
    if (repJnid === "unassigned") {
      conditions.push("sales_job.sales_rep_jnid IS NULL");
    } else if (repJnid) {
      conditions.push(`sales_job.sales_rep_jnid = $${index}`);
      params.push(repJnid);
      index++;
    }

    const tradeFilter = buildTradeFilter(trade);
    if (tradeFilter) conditions.push(tradeFilter.replace(/^AND /, ""));
    const where = conditions.join(" AND ");
    const attributeWhere = conditions.slice(2).join(" AND ");

    const [coreRows, revenueRows, segmentRows] = await Promise.all([
      query<RepCoreRow>(
        `SELECT
           COALESCE(sales_job.sales_rep_jnid, 'unassigned') AS rep_id,
           sales_job.sales_rep_name AS rep_name,
           COUNT(*)::text AS total_jobs,
           COUNT(*) FILTER (WHERE sales_job.sold)::text AS sold_jobs,
           COUNT(*) FILTER (WHERE sales_job.closed_lost)::text AS lost_jobs,
           COUNT(*) FILTER (
             WHERE sales_job.rep_source IN ('estimate_rep', 'job_owner')
           )::text AS fallback_jobs
         FROM metrics.v_sales_metrics_jobs sales_job
         JOIN metrics.v_jobs_clean j ON j.jnid = sales_job.job_jnid
         WHERE ${where}
         GROUP BY
           COALESCE(sales_job.sales_rep_jnid, 'unassigned'),
           sales_job.sales_rep_name
         ORDER BY sales_job.sales_rep_name`,
        params
      ),
      query<RepRevenueRow>(
        `SELECT
           COALESCE(sales_job.sales_rep_jnid, 'unassigned') AS rep_id,
           COALESCE(SUM(invoice.total), 0)::text AS revenue
         FROM metrics.v_invoices_clean invoice
         JOIN metrics.v_sales_metrics_jobs sales_job
           ON sales_job.job_jnid = invoice.job_jnid
         JOIN metrics.v_jobs_clean j ON j.jnid = sales_job.job_jnid
         WHERE COALESCE(invoice.date_invoice, invoice.jn_date_created)
             >= EXTRACT(EPOCH FROM $1::timestamptz)
           AND COALESCE(invoice.date_invoice, invoice.jn_date_created)
             < EXTRACT(EPOCH FROM $2::timestamptz)
           ${attributeWhere ? `AND ${attributeWhere}` : ""}
         GROUP BY COALESCE(sales_job.sales_rep_jnid, 'unassigned')`,
        params
      ),
      query<RepSegmentRow>(
        `SELECT
           COALESCE(sales_job.sales_rep_jnid, 'unassigned') AS rep_id,
           (${SEGMENT_SQL})::text AS segment,
           COUNT(*)::text AS total_jobs,
           COUNT(*) FILTER (WHERE sales_job.sold)::text AS sold_jobs
         FROM metrics.v_sales_metrics_jobs sales_job
         JOIN metrics.v_jobs_clean j ON j.jnid = sales_job.job_jnid
         WHERE ${where}
         GROUP BY
           COALESCE(sales_job.sales_rep_jnid, 'unassigned'),
           segment`,
        params
      ),
    ]);

    const revenueByRep = new Map(
      revenueRows.map((row) => [row.rep_id, parseFloat(row.revenue) || 0])
    );
    const segmentByRep = new Map<string, Record<string, number>>();
    for (const row of segmentRows) {
      const rates = segmentByRep.get(row.rep_id) ?? {};
      const total = parseInt(row.total_jobs, 10) || 0;
      const sold = parseInt(row.sold_jobs, 10) || 0;
      rates[row.segment] = total > 0 ? round1((sold / total) * 100) : 0;
      segmentByRep.set(row.rep_id, rates);
    }

    const reps = coreRows.map((row) => {
      const totalJobs = parseInt(row.total_jobs, 10) || 0;
      const wonJobs = parseInt(row.sold_jobs, 10) || 0;
      return {
        repId: row.rep_id,
        repName: row.rep_name,
        totalJobs,
        wonJobs,
        lostJobs: parseInt(row.lost_jobs, 10) || 0,
        closeRate: totalJobs > 0 ? round1((wonJobs / totalJobs) * 100) : 0,
        segmentCloseRates: segmentByRep.get(row.rep_id) ?? {},
        revenue: round2(revenueByRep.get(row.rep_id) ?? 0),
        fallbackAssignments: parseInt(row.fallback_jobs, 10) || 0,
        avgCycleDays: 0,
        statusConversions: [],
        followUpMetrics: {
          avgAfterEstimate: 0,
          avgAfterAppointment: 0,
          jobsWithZeroFollowUp: 0,
        },
        timeBetweenStatuses: [],
      };
    });

    reps.sort((a, b) => b.revenue - a.revenue);
    const totalJobs = reps.reduce((sum, rep) => sum + rep.totalJobs, 0);
    const totalWon = reps.reduce((sum, rep) => sum + rep.wonJobs, 0);

    return NextResponse.json(
      {
        period: {
          key: period,
          label: range.label,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          timeZone: "America/Chicago",
        },
        filters: { segment, rep: repJnid, trade },
        summary: {
          totalRevenue: round2(
            reps.reduce((sum, rep) => sum + rep.revenue, 0)
          ),
          avgCloseRate:
            totalJobs > 0 ? round1((totalWon / totalJobs) * 100) : 0,
          avgCycleTimeDays: 0,
          activeReps: reps.length,
          totalJobs,
          totalWon,
          totalLost: reps.reduce((sum, rep) => sum + rep.lostJobs, 0),
          fallbackAssignments: reps.reduce(
            (sum, rep) => sum + rep.fallbackAssignments,
            0
          ),
        },
        reps,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("Sales API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
