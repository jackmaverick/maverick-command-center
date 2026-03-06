import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL, segmentWhereClause } from "@/lib/segment";
import type { Segment } from "@/lib/constants";

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
  "warranty",
];

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
  revenue: string | null;
  supplier_cost: string | null;
  labor_cost: string | null;
  retail_cost: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "all") as PeriodKey;
    const segment = (searchParams.get("segment") as Segment | null) || null;

    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }
    if (segment && !VALID_SEGMENTS.includes(segment)) {
      return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
    }

    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    // Build WHERE conditions
    const conditions: string[] = [
      "j.status_name = 'Paid & Closed'",
      `j.jn_date_status_change >= $1`,
      `j.jn_date_status_change < $2`,
    ];
    const params: unknown[] = [startUnix, endUnix];
    let paramIdx = 3;

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
        ${SEGMENT_SQL} AS segment,
        j.cf_string_24,
        j.cf_string_25,
        j.cf_string_26,
        j.cf_string_27,
        j.cf_string_28,
        j.jn_date_status_change,
        COALESCE(inv.total_revenue, 0) AS revenue,
        COALESCE(mat.net_material_cost, 0) AS supplier_cost,
        COALESCE(wo.labor_cost, 0) AS labor_cost,
        COALESCE(rc.retail_cost, 0) AS retail_cost
      FROM jobs j
      LEFT JOIN LATERAL (
        SELECT SUM(i.total) AS total_revenue
        FROM invoices i
        WHERE i.job_jnid = j.jnid AND i.is_active = true
      ) inv ON true
      LEFT JOIN mat_job_material_costs mat ON mat.job_jnid = j.jnid
      LEFT JOIN LATERAL (
        SELECT SUM(w.total_line_item_cost) AS labor_cost
        FROM work_orders w
        WHERE w.job_jnid = j.jnid
          AND w.status_name IN ('Paid Crew', 'Paid & Closed', 'Closed')
      ) wo ON true
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

    // Process rows
    const jobs = rows.map((row) => {
      const revenue = parseFloat(row.revenue ?? "0");
      const supplierCost = parseFloat(row.supplier_cost ?? "0");
      const laborCost = parseFloat(row.labor_cost ?? "0");
      const retailCost = parseFloat(row.retail_cost ?? "0");
      const totalCost = supplierCost + laborCost + retailCost;
      const grossProfit = revenue - totalCost;
      const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      return {
        jobJnid: row.jnid,
        jobName: row.name,
        address: row.address_line1,
        segment: row.segment,
        jobTypes: getJobTypes(row),
        revenue,
        supplierCost,
        laborCost,
        retailCost,
        totalCost,
        grossProfit,
        marginPercent: Math.round(marginPercent * 10) / 10,
        dateCompleted: row.jn_date_status_change
          ? new Date(parseInt(row.jn_date_status_change) * 1000).toISOString()
          : null,
      };
    });

    // Summary
    const totalRevenue = jobs.reduce((s, j) => s + j.revenue, 0);
    const totalCosts = jobs.reduce((s, j) => s + j.totalCost, 0);
    const totalGrossProfit = totalRevenue - totalCosts;
    const avgMarginPercent =
      totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

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
