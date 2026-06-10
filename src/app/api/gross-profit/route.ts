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
  j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
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
  city: string | null;
  status_name: string | null;
  segment: string;
  cf_string_24: string | null;
  cf_string_25: string | null;
  cf_string_26: string | null;
  cf_string_27: string | null;
  cf_string_28: string | null;
  jn_date_status_change: string | null;
  sales_rep_name: string | null;
  revenue: string | null;
  materials_cost: string | null;
  labor_cost: string | null;
  subcontractor_cost: string | null;
  permit_cost: string | null;
  misc_cost: string | null;
  total_cost: string | null;
  gross_profit: string | null;
  margin_percent: string | null;
  is_final_gp_ready: boolean | null;
  is_accurate: boolean | null;
  accuracy_status: "accurate" | "needs_review" | "not_final";
  gp_confidence: string | null;
  gp_ready_reason: string | null;
  gp_blockers: string[] | null;
  system_cost_warnings: string[] | null;
  non_final_work_order_count: string | number | null;
  supplier_review_invoice_count: string | number | null;
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
        j.city,
        j.status_name,
        (${SEGMENT_SQL}) AS segment,
        j.cf_string_24,
        j.cf_string_25,
        j.cf_string_26,
        j.cf_string_27,
        j.cf_string_28,
        j.jn_date_status_change,
        j.sales_rep_name,
        COALESCE(gp.revenue_for_gp, 0) AS revenue,
        COALESCE(gp.supplier_material_cost, 0) AS materials_cost,
        COALESCE(gp.finalized_work_order_cost, 0) + COALESCE(gp.subcontractor_invoice_cost, 0) AS labor_cost,
        COALESCE(gp.subcontractor_invoice_cost, 0) AS subcontractor_cost,
        COALESCE(gp.permit_cost, COALESCE(gp.city_permit_cost, 0) + COALESCE(gp.hoa_permit_cost, 0)) AS permit_cost,
        COALESCE(gp.retail_misc_cost, 0)
          + COALESCE(gp.permit_cost, COALESCE(gp.city_permit_cost, 0) + COALESCE(gp.hoa_permit_cost, 0))
          + COALESCE(mc.measurement_cost, 0) AS misc_cost,
        COALESCE(gp.supplier_material_cost, 0)
          + COALESCE(gp.finalized_work_order_cost, 0)
          + COALESCE(gp.subcontractor_invoice_cost, 0)
          + COALESCE(gp.retail_misc_cost, 0)
          + COALESCE(gp.permit_cost, COALESCE(gp.city_permit_cost, 0) + COALESCE(gp.hoa_permit_cost, 0))
          + COALESCE(mc.measurement_cost, 0) AS total_cost,
        COALESCE(gp.revenue_for_gp, 0)
          - COALESCE(gp.supplier_material_cost, 0)
          - COALESCE(gp.finalized_work_order_cost, 0)
          - COALESCE(gp.subcontractor_invoice_cost, 0)
          - COALESCE(gp.retail_misc_cost, 0)
          - COALESCE(gp.permit_cost, COALESCE(gp.city_permit_cost, 0) + COALESCE(gp.hoa_permit_cost, 0))
          - COALESCE(mc.measurement_cost, 0) AS gross_profit,
        CASE
          WHEN COALESCE(gp.revenue_for_gp, 0) > 0
          THEN (
            COALESCE(gp.revenue_for_gp, 0)
              - COALESCE(gp.supplier_material_cost, 0)
              - COALESCE(gp.finalized_work_order_cost, 0)
              - COALESCE(gp.subcontractor_invoice_cost, 0)
              - COALESCE(gp.retail_misc_cost, 0)
              - COALESCE(gp.permit_cost, COALESCE(gp.city_permit_cost, 0) + COALESCE(gp.hoa_permit_cost, 0))
              - COALESCE(mc.measurement_cost, 0)
          ) / COALESCE(gp.revenue_for_gp, 0) * 100
          ELSE 0
        END AS margin_percent,
        gp.is_final_gp_ready,
        (
          gp.is_final_gp_ready
          AND COALESCE(gp.gp_confidence, '') IN ('medium', 'high')
          AND COALESCE(cardinality(gp.gp_blockers), 0) = 0
        ) AS is_accurate,
        CASE
          WHEN NOT COALESCE(gp.is_final_gp_ready, false) THEN 'not_final'
          WHEN COALESCE(gp.gp_confidence, '') IN ('medium', 'high')
           AND COALESCE(cardinality(gp.gp_blockers), 0) = 0 THEN 'accurate'
          ELSE 'needs_review'
        END AS accuracy_status,
        gp.gp_confidence,
        gp.gp_ready_reason,
        gp.gp_blockers,
        gp.system_cost_warnings,
        COALESCE(gp.non_final_work_order_count, 0) AS non_final_work_order_count,
        COALESCE(gp.supplier_review_invoice_count, 0) AS supplier_review_invoice_count
      FROM jobs j
      LEFT JOIN v_job_final_gp gp ON gp.job_jnid = j.jnid
      LEFT JOIN LATERAL (
        WITH measurement_flags AS (
          SELECT
            EXISTS (
              SELECT 1
              FROM roof_measurements rm
              WHERE rm.job_jnid = j.jnid
            ) OR EXISTS (
              SELECT 1
              FROM files f
              WHERE f.job_jnid = j.jnid
                AND f.deleted_at IS NULL
                AND (
                  COALESCE(f.description, '') ILIKE '%gaf measure%'
                  OR COALESCE(f.description, '') ILIKE '%gaf measurement%'
                  OR COALESCE(f.filename, '') ILIKE '%gaf%'
                  OR COALESCE(f.filename, '') ILIKE '%quickmeasure%'
                  OR COALESCE(f.filename, '') ILIKE '%quick measure%'
                  OR COALESCE(f.original_filename, '') ILIKE '%gaf%'
                  OR COALESCE(f.original_filename, '') ILIKE '%quickmeasure%'
                  OR COALESCE(f.original_filename, '') ILIKE '%quick measure%'
                )
            ) AS has_gaf_measurement,
            EXISTS (
              SELECT 1
              FROM files f
              WHERE f.job_jnid = j.jnid
                AND f.deleted_at IS NULL
                AND (
                  COALESCE(f.description, '') ILIKE '%first mate%'
                  OR COALESCE(f.description, '') ILIKE '%firstmate%'
                  OR COALESCE(f.filename, '') ILIKE '%first mate%'
                  OR COALESCE(f.filename, '') ILIKE '%firstmate%'
                  OR COALESCE(f.original_filename, '') ILIKE '%first mate%'
                  OR COALESCE(f.original_filename, '') ILIKE '%firstmate%'
                )
            ) AS has_first_mate_measurement
        )
        SELECT
          (CASE WHEN has_gaf_measurement THEN 35 ELSE 0 END)
            + (CASE WHEN has_first_mate_measurement THEN 14 ELSE 0 END)
            AS measurement_cost
        FROM measurement_flags
      ) mc ON true
      WHERE ${whereClause}
      ORDER BY j.jn_date_status_change DESC
      `,
      params
    );

    const jobs = rows.map((row) => ({
      jobJnid: row.jnid,
      jobName: row.name,
      address: row.address_line1,
      city: row.city,
      segment: row.segment,
      salesRepName: row.sales_rep_name,
      statusName: row.status_name,
      jobTypes: getJobTypes(row),
      revenue: money(row.revenue),
      materialsCost: money(row.materials_cost),
      laborCost: money(row.labor_cost),
      subcontractorCost: money(row.subcontractor_cost),
      permitCost: money(row.permit_cost),
      miscCost: money(row.misc_cost),
      totalCost: money(row.total_cost),
      grossProfit: money(row.gross_profit),
      marginPercent: Math.round(Number(row.margin_percent ?? 0) * 10) / 10,
      isFinalGpReady: Boolean(row.is_final_gp_ready),
      isAccurate: Boolean(row.is_accurate),
      accuracyStatus: row.accuracy_status,
      gpConfidence: row.gp_confidence ?? "not_final",
      gpReadyReason: row.gp_ready_reason,
      gpBlockers: row.gp_blockers ?? [],
      systemCostWarnings: row.system_cost_warnings ?? [],
      nonFinalWorkOrderCount: Number(row.non_final_work_order_count ?? 0),
      supplierReviewInvoiceCount: Number(row.supplier_review_invoice_count ?? 0),
      dateCompleted: row.jn_date_status_change
        ? new Date(parseInt(row.jn_date_status_change) * 1000).toISOString()
        : null,
    }));

    const totalRevenue = money(jobs.reduce((s, j) => s + j.revenue, 0));
    const totalCosts = money(jobs.reduce((s, j) => s + j.totalCost, 0));
    const totalGrossProfit = money(totalRevenue - totalCosts);
    const avgMarginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
    const accurateJobCount = jobs.filter((j) => j.accuracyStatus === "accurate").length;
    const needsReviewJobCount = jobs.filter((j) => j.accuracyStatus === "needs_review").length;
    const notFinalJobCount = jobs.filter((j) => j.accuracyStatus === "not_final").length;

    return NextResponse.json({
      period: { key: period, label: range.label },
      summary: {
        totalRevenue,
        totalCosts,
        totalGrossProfit,
        avgMarginPercent: Math.round(avgMarginPercent * 10) / 10,
        jobCount: jobs.length,
        accurateJobCount,
        needsReviewJobCount,
        notFinalJobCount,
        accuracyPercent: jobs.length > 0 ? Math.round((accurateJobCount / jobs.length) * 1000) / 10 : 0,
      },
      jobs,
    });
  } catch (error) {
    console.error("Gross profit API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
