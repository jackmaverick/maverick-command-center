import { query } from "@/lib/db";
import { SEGMENT_SQL } from "@/lib/segment";

export type HealthStatus = "green" | "yellow" | "red";

export const CASHFLOW_COHORT_START = "2026-01-21";
export const POST_SOLD_CASH_STAGES = "'sold','approval','production_ready','scheduled','production'";

export const STAGE_CASE = `
  CASE
    WHEN j.status_name IN ('Lead', 'New', 'Storm Alert', 'Waiting on Claim', 'Claim Review') THEN 'lead'
    WHEN j.status_name IN ('Appointment Scheduled', 'Adjuster Appt Scheduled', 'Needs Rescheduling') THEN 'appointment'
    WHEN j.status_name IN ('Appt Ran', 'Adjuster Appt Ran') THEN 'appt_ran'
    WHEN j.status_name IN ('Estimating') THEN 'estimating'
    WHEN j.status_name IN ('Estimate Sent') THEN 'estimate_sent'
    WHEN j.status_name IN ('Sold Job', 'Fully Approved', 'Future Work') THEN 'sold'
    WHEN j.status_name IN ('Scope Approval', 'City / HOA Approval', 'Waiting on Homeowner', 'Deductible Invoice Sent', 'Deductible Collected', 'Pre Production Supplementing', 'Waiting on Supplements', 'Insurance Pending/Cont Skipped', 'Project Review In Progress') THEN 'approval'
    WHEN j.status_name IN ('Production Ready') THEN 'production_ready'
    WHEN j.status_name IN ('Job Scheduled') THEN 'scheduled'
    WHEN j.status_name IN ('In Production', 'In Progress') THEN 'production'
    WHEN j.status_name IN ('Final Invoicing', 'Final Invoice Sent', 'Invoiced', 'Pending Final Payment', 'Close Out In Progress', 'Work Completed Approved', 'Repair Completed Approved', 'Job Completed', 'Job Close Out', 'Back End Job Audit') THEN 'invoice'
    WHEN j.status_name = 'Paid & Closed' THEN 'paid'
    ELSE 'other'
  END
`;

export const VALUE_SQL = `
  GREATEST(
    COALESCE(j.approved_invoice_due, 0),
    COALESCE(j.approved_invoice_total, 0),
    COALESCE(j.approved_estimate_total, 0),
    COALESCE(j.parent_approved_invoice_due, 0),
    COALESCE(j.parent_approved_invoice_total, 0),
    COALESCE(j.parent_approved_estimate_total, 0),
    COALESCE(j.last_invoice, 0),
    COALESCE(j.last_estimate, 0),
    0
  )
`;

export function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100) / 100;
}

function hoursSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.round(((Date.now() - time) / 36_000) / 10) / 10;
}

function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  return "green";
}

function freshnessStatus(ageHours: number | null, redAfterHours: number): HealthStatus {
  if (ageHours === null) return "red";
  if (ageHours > redAfterHours) return "red";
  if (ageHours > redAfterHours / 2) return "yellow";
  return "green";
}

function varianceStatus(dollars: number, percent: number): HealthStatus {
  if (dollars > 5000 || percent > 3) return "red";
  if (dollars > 1000 || percent > 1) return "yellow";
  return "green";
}

type ApiLike = {
  generatedAt?: string;
  summary?: {
    arTotal?: number;
    arWeighted?: number;
    soldPipelineValue?: number;
    estimatePipelineValue?: number;
    expectedCash?: {
      next30?: number;
      next60?: number;
      next90?: number;
    };
  };
  arBySegment?: unknown[];
  pipelineByStage?: unknown[];
  timing?: unknown[];
  conversionMatrix?: unknown[];
  stuckMoney?: unknown[];
};

type SourceTotals = {
  ar_total: string;
  ar_weighted: string;
  sold_pipeline_value: string;
  estimate_pipeline_value: string;
  expected_30: string;
  expected_60: string;
  expected_90: string;
  post_sold_job_count: string;
  estimate_context_job_count: string;
  other_status_value: string;
  other_status_count: string;
};

type FreshnessRow = {
  source: string;
  row_count: string;
  latest_source_at: string | null;
  latest_synced_at: string | null;
};

type StatusBucketRow = {
  status_name: string;
  cash_stage: string;
  job_count: string;
  raw_value: string;
};

type SourceRow = Record<string, string | number | null>;

async function getSourceTotals(): Promise<SourceTotals> {
  const rows = await query<SourceTotals>(`
    WITH open_jobs AS (
      SELECT j.*, (${SEGMENT_SQL}) AS segment, ${STAGE_CASE} AS cash_stage, ${VALUE_SQL} AS value
      FROM jobs j
      WHERE j.is_active = true
        AND j.is_archived = false
        AND COALESCE(j.deleted_at::text, '') = ''
        AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
        AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Paid & Closed')
    ), ar AS (
      SELECT
        COALESCE(SUM(COALESCE(i.due, i.total - COALESCE(i.total_paid, 0))), 0) AS ar_total,
        COALESCE(SUM(COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) *
          CASE
            WHEN EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created))) <= 30 THEN 0.90
            WHEN EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created))) <= 60 THEN 0.70
            WHEN EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created))) <= 90 THEN 0.40
            ELSE 0.15
          END), 0) AS ar_weighted
      FROM invoices i
      WHERE i.is_active = true
        AND i.is_archived = false
        AND COALESCE(i.deleted_at::text, '') = ''
        AND COALESCE(i.status_name, '') <> 'Draft'
        AND COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) > 0
    )
    SELECT
      (SELECT ar_total FROM ar)::text AS ar_total,
      (SELECT ar_weighted FROM ar)::text AS ar_weighted,
      COALESCE(SUM(value) FILTER (WHERE cash_stage IN (${POST_SOLD_CASH_STAGES}) AND value > 0), 0)::text AS sold_pipeline_value,
      COALESCE(SUM(value) FILTER (WHERE cash_stage IN ('estimating','estimate_sent')), 0)::text AS estimate_pipeline_value,
      (COALESCE((SELECT ar_weighted FROM ar), 0)
        + COALESCE(SUM(value * CASE
            WHEN cash_stage = 'production' THEN 0.65
            WHEN cash_stage = 'scheduled' THEN 0.45
            WHEN cash_stage = 'production_ready' THEN 0.35
            WHEN cash_stage = 'approval' THEN 0.20
            WHEN cash_stage = 'sold' AND segment = 'retail' THEN 0.25
            WHEN cash_stage = 'sold' THEN 0.10
            ELSE 0
          END), 0))::text AS expected_30,
      (COALESCE((SELECT ar_weighted FROM ar), 0)
        + COALESCE(SUM(value * CASE
            WHEN cash_stage = 'production' THEN 0.85
            WHEN cash_stage = 'scheduled' THEN 0.75
            WHEN cash_stage = 'production_ready' THEN 0.65
            WHEN cash_stage = 'approval' THEN 0.45
            WHEN cash_stage = 'sold' AND segment = 'retail' THEN 0.55
            WHEN cash_stage = 'sold' THEN 0.28
            ELSE 0
          END), 0))::text AS expected_60,
      (COALESCE((SELECT ar_weighted FROM ar), 0)
        + COALESCE(SUM(value * CASE
            WHEN cash_stage = 'production' THEN 0.92
            WHEN cash_stage = 'scheduled' THEN 0.88
            WHEN cash_stage = 'production_ready' THEN 0.82
            WHEN cash_stage = 'approval' THEN 0.70
            WHEN cash_stage = 'sold' AND segment = 'retail' THEN 0.78
            WHEN cash_stage = 'sold' THEN 0.55
            ELSE 0
          END), 0))::text AS expected_90,
      COUNT(*) FILTER (WHERE cash_stage IN (${POST_SOLD_CASH_STAGES}) AND value > 0)::text AS post_sold_job_count,
      COUNT(*) FILTER (WHERE cash_stage IN ('estimating','estimate_sent'))::text AS estimate_context_job_count,
      COALESCE(SUM(value) FILTER (WHERE cash_stage = 'other' AND value > 0), 0)::text AS other_status_value,
      COUNT(*) FILTER (WHERE cash_stage = 'other' AND value > 0)::text AS other_status_count
    FROM open_jobs
  `);

  return rows[0] ?? {
    ar_total: "0",
    ar_weighted: "0",
    sold_pipeline_value: "0",
    estimate_pipeline_value: "0",
    expected_30: "0",
    expected_60: "0",
    expected_90: "0",
    post_sold_job_count: "0",
    estimate_context_job_count: "0",
    other_status_value: "0",
    other_status_count: "0",
  };
}

async function getFreshnessRows(): Promise<FreshnessRow[]> {
  return query<FreshnessRow>(`
    SELECT * FROM (
      SELECT 'jobs' AS source, COUNT(*)::text AS row_count, MAX(to_timestamp(NULLIF(jn_date_updated, 0)))::text AS latest_source_at, MAX(last_synced_at)::text AS latest_synced_at FROM jobs
      UNION ALL SELECT 'invoices', COUNT(*)::text, MAX(to_timestamp(NULLIF(jn_date_updated, 0)))::text, MAX(last_synced_at)::text FROM invoices
      UNION ALL SELECT 'payments', COUNT(*)::text, MAX(to_timestamp(NULLIF(jn_date_updated, 0)))::text, MAX(last_synced_at)::text FROM payments
      UNION ALL SELECT 'estimates', COUNT(*)::text, MAX(jn_date_updated)::text, MAX(last_synced_at)::text FROM estimates
      UNION ALL SELECT 'work_orders', COUNT(*)::text, MAX(to_timestamp(NULLIF(jn_date_updated, 0)))::text, MAX(last_synced_at)::text FROM work_orders
      UNION ALL SELECT 'job_stage_history', COUNT(*)::text, MAX(changed_at)::text, MAX(created_at)::text FROM job_stage_history
      UNION ALL SELECT 'tasks', COUNT(*)::text, MAX(to_timestamp(NULLIF(jn_date_updated, 0)))::text, MAX(last_synced_at)::text FROM tasks
      UNION ALL SELECT 'activities', COUNT(*)::text, MAX(activity_date)::text, MAX(last_synced_at)::text FROM activities
      UNION ALL SELECT 'sync_log', COUNT(*)::text, MAX(COALESCE(completed_at, created_at))::text, MAX(COALESCE(completed_at, created_at))::text FROM sync_log
    ) freshness
  `);
}

async function getStatusBuckets(): Promise<StatusBucketRow[]> {
  return query<StatusBucketRow>(`
    WITH open_jobs AS (
      SELECT COALESCE(j.status_name, 'Unknown') AS status_name, ${STAGE_CASE} AS cash_stage, ${VALUE_SQL} AS value
      FROM jobs j
      WHERE j.is_active = true
        AND j.is_archived = false
        AND COALESCE(j.deleted_at::text, '') = ''
        AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
        AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Paid & Closed')
    )
    SELECT status_name, cash_stage, COUNT(*)::text AS job_count, COALESCE(SUM(value), 0)::text AS raw_value
    FROM open_jobs
    GROUP BY status_name, cash_stage
    ORDER BY SUM(value) DESC
  `);
}

async function getSourceSamples() {
  const [arRows, pipelineRows, estimateRows] = await Promise.all([
    query<SourceRow>(`
      SELECT
        i.number AS invoice_number,
        j.number AS job_number,
        j.name AS job_name,
        (${SEGMENT_SQL}) AS segment,
        COALESCE(i.due, i.total - COALESCE(i.total_paid, 0))::text AS due,
        EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created)))::int AS age_days,
        i.status_name
      FROM invoices i
      LEFT JOIN jobs j ON j.jnid = i.job_jnid
      WHERE i.is_active = true
        AND i.is_archived = false
        AND COALESCE(i.deleted_at::text, '') = ''
        AND COALESCE(i.status_name, '') <> 'Draft'
        AND COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) > 0
      ORDER BY COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) DESC
      LIMIT 15
    `),
    query<SourceRow>(`
      SELECT j.number AS job_number, j.name AS job_name, (${SEGMENT_SQL}) AS segment, j.status_name, ${STAGE_CASE} AS cash_stage, ${VALUE_SQL}::text AS value
      FROM jobs j
      WHERE j.is_active = true
        AND j.is_archived = false
        AND COALESCE(j.deleted_at::text, '') = ''
        AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
        AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Paid & Closed')
        AND ${STAGE_CASE} IN (${POST_SOLD_CASH_STAGES})
        AND ${VALUE_SQL} > 0
      ORDER BY ${VALUE_SQL} DESC
      LIMIT 15
    `),
    query<SourceRow>(`
      SELECT j.number AS job_number, j.name AS job_name, (${SEGMENT_SQL}) AS segment, j.status_name, ${STAGE_CASE} AS cash_stage, ${VALUE_SQL}::text AS value
      FROM jobs j
      WHERE j.is_active = true
        AND j.is_archived = false
        AND COALESCE(j.deleted_at::text, '') = ''
        AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
        AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Paid & Closed')
        AND ${STAGE_CASE} IN ('estimating','estimate_sent')
        AND ${VALUE_SQL} > 0
      ORDER BY ${VALUE_SQL} DESC
      LIMIT 15
    `),
  ]);

  return { arRows, pipelineRows, estimateRows };
}

function buildComparisons(source: SourceTotals, apiData: ApiLike | null) {
  const comparisonInputs = [
    ["AR total", toNumber(source.ar_total), apiData?.summary?.arTotal],
    ["Weighted AR", toNumber(source.ar_weighted), apiData?.summary?.arWeighted],
    ["Sold pipeline", toNumber(source.sold_pipeline_value), apiData?.summary?.soldPipelineValue],
    ["Estimate context", toNumber(source.estimate_pipeline_value), apiData?.summary?.estimatePipelineValue],
    ["Expected 30d", toNumber(source.expected_30), apiData?.summary?.expectedCash?.next30],
    ["Expected 60d", toNumber(source.expected_60), apiData?.summary?.expectedCash?.next60],
    ["Expected 90d", toNumber(source.expected_90), apiData?.summary?.expectedCash?.next90],
  ] as const;

  return comparisonInputs.map(([label, sourceValue, apiValueRaw]) => {
    const apiValue = typeof apiValueRaw === "number" ? apiValueRaw : null;
    const varianceDollars = apiValue === null ? Math.abs(sourceValue) : Math.abs(sourceValue - apiValue);
    const variancePercent = apiValue === null ? 100 : Math.round((varianceDollars / Math.max(Math.abs(sourceValue), 1)) * 1000) / 10;
    return {
      label,
      sourceValue,
      apiValue,
      varianceDollars: Math.round(varianceDollars * 100) / 100,
      variancePercent,
      status: apiValue === null ? "red" as HealthStatus : varianceStatus(varianceDollars, variancePercent),
    };
  });
}

export async function buildPipelineCashflowReconciliation(apiData: ApiLike | null) {
  const [sourceTotals, statusBuckets, sourceSamples] = await Promise.all([
    getSourceTotals(),
    getStatusBuckets(),
    getSourceSamples(),
  ]);

  const comparisons = buildComparisons(sourceTotals, apiData);
  const status = worstStatus(comparisons.map((comparison) => comparison.status));
  const unmappedStatuses = statusBuckets
    .filter((row) => row.cash_stage === "other" && toNumber(row.raw_value) > 0)
    .map((row) => ({
      statusName: row.status_name,
      jobCount: parseInt(row.job_count, 10) || 0,
      rawValue: toNumber(row.raw_value),
      material: toNumber(row.raw_value) >= 10000,
    }));

  const maxVarianceDollars = Math.max(...comparisons.map((comparison) => comparison.varianceDollars), 0);
  const maxVariancePercent = Math.max(...comparisons.map((comparison) => comparison.variancePercent), 0);

  return {
    generatedAt: new Date().toISOString(),
    status,
    thresholds: {
      greenVariance: "<= 1% and <= $1,000",
      redVariance: "> 3% or > $5,000",
      materialUnmappedStatus: ">= $10,000",
    },
    sourceTotals: {
      arTotal: toNumber(sourceTotals.ar_total),
      arWeighted: toNumber(sourceTotals.ar_weighted),
      soldPipelineValue: toNumber(sourceTotals.sold_pipeline_value),
      estimatePipelineValue: toNumber(sourceTotals.estimate_pipeline_value),
      expectedCash: {
        next30: toNumber(sourceTotals.expected_30),
        next60: toNumber(sourceTotals.expected_60),
        next90: toNumber(sourceTotals.expected_90),
      },
      postSoldJobCount: parseInt(sourceTotals.post_sold_job_count, 10) || 0,
      estimateContextJobCount: parseInt(sourceTotals.estimate_context_job_count, 10) || 0,
      otherStatusValue: toNumber(sourceTotals.other_status_value),
      otherStatusCount: parseInt(sourceTotals.other_status_count, 10) || 0,
    },
    apiTotals: apiData?.summary ?? null,
    comparisons,
    maxVarianceDollars,
    maxVariancePercent,
    unmappedStatuses,
    sourceSamples,
  };
}

export async function buildPipelineCashflowFreshness() {
  const rows = await getFreshnessRows();
  const slowCadence = new Set(["job_stage_history", "tasks", "activities"]);

  const sources = rows.map((row) => {
    const ageHours = hoursSince(row.latest_synced_at ?? row.latest_source_at);
    const sourceAgeHours = hoursSince(row.latest_source_at);
    const syncedAgeHours = hoursSince(row.latest_synced_at);
    const redAfterHours = slowCadence.has(row.source) ? 72 : 24;
    return {
      source: row.source,
      rowCount: parseInt(row.row_count, 10) || 0,
      latestSourceAt: row.latest_source_at,
      latestSyncedAt: row.latest_synced_at,
      sourceAgeHours,
      syncedAgeHours,
      ageHours,
      redAfterHours,
      status: row.source === "sync_log" ? "green" as HealthStatus : freshnessStatus(ageHours, redAfterHours),
    };
  });

  const criticalSources = sources.filter((source) => source.source !== "sync_log");

  return {
    generatedAt: new Date().toISOString(),
    status: worstStatus(criticalSources.map((source) => source.status)),
    maxAgeHours: Math.max(...criticalSources.map((source) => source.ageHours ?? 9999), 0),
    sources,
    syncMode: {
      current: "Supabase mirror on page/API read",
      nearInstantRequirement: "JobNimbus webhook or real incremental sync must update Supabase within minutes. The dashboard can detect stale data instantly, but it cannot make stale mirror data fresh by itself.",
    },
  };
}

export async function buildPipelineCashflowHealth(apiData: ApiLike | null) {
  const [freshness, reconciliation, statusBuckets] = await Promise.all([
    buildPipelineCashflowFreshness(),
    buildPipelineCashflowReconciliation(apiData),
    getStatusBuckets(),
  ]);

  const requiredArrays = ["arBySegment", "pipelineByStage", "timing", "conversionMatrix", "stuckMoney"] as const;
  const shapeChecks = requiredArrays.map((key) => ({
    key,
    present: Array.isArray(apiData?.[key]),
    count: Array.isArray(apiData?.[key]) ? apiData?.[key]?.length ?? 0 : 0,
  }));
  const apiShapeStatus: HealthStatus = apiData && shapeChecks.every((check) => check.present) ? "green" : "red";

  const materialUnmapped = reconciliation.unmappedStatuses.filter((status) => status.material);
  const unmappedStatus: HealthStatus = materialUnmapped.length ? "yellow" : "green";
  const status = worstStatus([apiShapeStatus, freshness.status, reconciliation.status, unmappedStatus]);

  return {
    generatedAt: new Date().toISOString(),
    status,
    apiShape: {
      status: apiShapeStatus,
      generatedAt: apiData?.generatedAt ?? null,
      checks: shapeChecks,
    },
    freshness,
    reconciliation: {
      status: reconciliation.status,
      maxVarianceDollars: reconciliation.maxVarianceDollars,
      maxVariancePercent: reconciliation.maxVariancePercent,
      comparisons: reconciliation.comparisons,
    },
    classification: {
      status: unmappedStatus,
      materialUnmapped,
      statusBucketCount: statusBuckets.length,
    },
    instantAccuracy: {
      status: freshness.status === "green" && reconciliation.status === "green" ? "green" : "yellow",
      summary: "The page reads live from Supabase on every API request. Near-instant accuracy depends on the JobNimbus-to-Supabase mirror staying fresh; this monitor now exposes stale source data instead of hiding it.",
      nextBestBuild: "Wire real JobNimbus webhook/incremental sync for jobs, estimates, invoices, payments, work orders, activities, and stage history, then alert when freshness exceeds the thresholds above.",
    },
  };
}
