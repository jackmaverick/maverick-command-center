import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, isValidPeriodKey, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL, segmentWhereClause } from "@/lib/segment";
import type { Segment } from "@/lib/constants";

const VALID_SEGMENTS: Segment[] = [
  "real_estate",
  "retail",
  "insurance",
  "repairs",
  "warranty",
];
const CLOSED_STATUSES = [
  "Paid & Closed",
  "Job Close Out",
  "All Work Complete",
  "All Work Completed",
  "Job Completed",
  "Warranty Complete",
];
const ACTIVE_REAL_JOB_WHERE = `
  COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;

function getJobTypes(row: {
  cf_string_24: string | null;
  cf_string_25: string | null;
  cf_string_26: string | null;
  cf_string_27: string | null;
  cf_string_28: string | null;
}): string[] {
  const types: string[] = [];
  const isY = (v: string | null) => v != null && v.includes("Y");
  if (isY(row.cf_string_24)) types.push("Roof");
  if (isY(row.cf_string_25)) types.push("Siding");
  if (isY(row.cf_string_26)) types.push("Gutters");
  if (isY(row.cf_string_27)) types.push("Windows");
  if (isY(row.cf_string_28)) types.push("Repair");
  return types;
}

interface JobRow {
  jnid: string;
  name: string;
  address_line1: string | null;
  segment: string;
  cf_string_24: string | null;
  cf_string_25: string | null;
  cf_string_26: string | null;
  cf_string_27: string | null;
  cf_string_28: string | null;
  jn_date_status_change: string | null;
  sales_rep_name: string | null;
  revenue: string | null;
  supplier_cost: string | null;
  labor_cost: string | null;
  subcontractor_cost: string | null;
  retail_cost: string | null;
  total_cost: string | null;
  gross_profit: string | null;
  margin_percent: string | null;
  cost_status: string | null;
}

function money(v: string | number | null | undefined): number {
  return Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "all") as PeriodKey;
    const segment = (searchParams.get("segment") as Segment | null) || null;

    if (!isValidPeriodKey(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }
    if (segment && !VALID_SEGMENTS.includes(segment)) {
      return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
    }

    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    const conditions: string[] = [
      ACTIVE_REAL_JOB_WHERE,
      "j.status_name = ANY($1::text[])",
      "j.jn_date_status_change >= $2",
      "j.jn_date_status_change < $3",
    ];
    const params: unknown[] = [CLOSED_STATUSES, startUnix, endUnix];
    let paramIdx = 4;

    if (segment) {
      conditions.push(segmentWhereClause(paramIdx));
      params.push(segment);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    const rows = await query<JobRow>(
      `
      SELECT
        j.jnid,
        j.name,
        j.address_line1,
        (${SEGMENT_SQL}) AS segment,
        j.cf_string_24,
        j.cf_string_25,
        j.cf_string_26,
        j.cf_string_27,
        j.cf_string_28,
        j.jn_date_status_change,
        j.sales_rep_name,
        COALESCE(c.invoiced_total, 0) AS revenue,
        COALESCE(c.material_cost, 0) AS supplier_cost,
        COALESCE(c.crew_labor_cost, 0) AS labor_cost,
        COALESCE(c.subcontractor_cost, 0) AS subcontractor_cost,
        COALESCE(rc.retail_cost, 0) AS retail_cost,
        COALESCE(c.total_cost, 0) + COALESCE(rc.retail_cost, 0) AS total_cost,
        COALESCE(c.invoiced_total, 0) - (COALESCE(c.total_cost, 0) + COALESCE(rc.retail_cost, 0)) AS gross_profit,
        CASE
          WHEN COALESCE(c.invoiced_total, 0) > 0
          THEN ((COALESCE(c.invoiced_total, 0) - (COALESCE(c.total_cost, 0) + COALESCE(rc.retail_cost, 0))) / COALESCE(c.invoiced_total, 0)) * 100
          ELSE 0
        END AS margin_percent,
        c.cost_status
      FROM jobs j
      LEFT JOIN v_job_total_costs c ON c.job_jnid = j.jnid
      LEFT JOIN LATERAL (
        SELECT SUM(r.amount) AS retail_cost
        FROM job_retail_costs r
        WHERE r.job_jnid = j.jnid
      ) rc ON true
      WHERE ${whereClause}
      ORDER BY j.jn_date_status_change DESC
      `,
      params
    );

    const jobs = rows.map((row) => ({
      jobJnid: row.jnid,
      jobName: row.name,
      address: row.address_line1,
      segment: row.segment,
      salesRepName: row.sales_rep_name,
      jobTypes: getJobTypes(row),
      revenue: money(row.revenue),
      supplierCost: money(row.supplier_cost),
      laborCost: money(row.labor_cost),
      subcontractorCost: money(row.subcontractor_cost),
      retailCost: money(row.retail_cost),
      totalCost: money(row.total_cost),
      grossProfit: money(row.gross_profit),
      marginPercent: Math.round(Number(row.margin_percent ?? 0) * 10) / 10,
      costStatus: row.cost_status,
      dateCompleted: row.jn_date_status_change
        ? new Date(parseInt(row.jn_date_status_change) * 1000).toISOString()
        : null,
    }));

    const totalRevenue = money(jobs.reduce((s, j) => s + j.revenue, 0));
    const totalCosts = money(jobs.reduce((s, j) => s + j.totalCost, 0));
    const totalGrossProfit = money(totalRevenue - totalCosts);
    const avgMarginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

    return NextResponse.json({
      period: { key: period, label: range.label },
      summary: {
        totalRevenue,
        totalCosts,
        totalGrossProfit,
        avgMarginPercent: Math.round(avgMarginPercent * 10) / 10,
        jobCount: jobs.length,
      },
      jobs,
    });
  } catch (error) {
    console.error("Gross profit API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
