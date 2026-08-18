import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ORDERED_STATUSES, STATUS_TO_STAGE, type Stage } from "@/lib/constants";

const TIMING_COHORT_START = "2026-01-21";
const JOBNIMBUS_BASE_URL = "https://app.jobnimbus.com/job/";

const RECORD_TYPE_SQL = `
  CASE
    WHEN lower(COALESCE(j.record_type_name, '')) LIKE '%repair%' THEN 'repairs'
    WHEN lower(COALESCE(j.record_type_name, '')) LIKE '%insurance%' THEN 'insurance'
    WHEN lower(COALESCE(j.record_type_name, '')) LIKE '%retail%' THEN 'retail'
    WHEN lower(COALESCE(j.record_type_name, '')) LIKE '%commercial%' THEN 'light_commercial'
    ELSE 'other'
  END
`;

const ACTIVE_REAL_JOB_WHERE = `
  j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.deleted_at::text, '') = ''
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|jane tester|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;

const OPEN_PIPELINE_WHERE = `
  ${ACTIVE_REAL_JOB_WHERE}
  AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Dead', 'No Damage', 'Internal Supplementing', 'Paid & Closed')
`;

const VALUE_SQL = `
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

const AR_DUE_SQL = `
  (
    SELECT COALESCE(SUM(GREATEST(COALESCE(i.due, COALESCE(i.total, 0) - COALESCE(i.total_paid, 0)), 0)), 0)
    FROM invoices i
    WHERE i.job_jnid = j.jnid
      AND i.is_active = true
      AND i.is_archived = false
      AND COALESCE(i.deleted_at::text, '') = ''
      AND COALESCE(i.status_name, i.status::text, '') IN ('Sent', 'Open', 'Closed')
      AND COALESCE(i.due, COALESCE(i.total, 0) - COALESCE(i.total_paid, 0)) > 0
  )
`;

const STAGE_SQL = `
  CASE
    WHEN COALESCE(j.status_name, '') IN ('Lead', 'New', 'Cold Lead', 'Storm Alert') THEN 'Lead'
    WHEN COALESCE(j.status_name, '') IN ('Appointment Scheduled', 'Adjuster Appt Scheduled') THEN 'Appointment Scheduled'
    WHEN COALESCE(j.status_name, '') IN ('Appt Ran', 'Appointment Ran', 'Adjuster Appt Ran') THEN 'Appointment Ran'
    WHEN COALESCE(j.status_name, '') IN ('Estimating', 'Estimate Sent', 'Claim Review', 'Scope Approval', 'Waiting on Claim') THEN 'Estimating'
    WHEN COALESCE(j.status_name, '') IN ('Invoiced', 'Final Invoicing', 'Deductible Invoice Sent', 'Final Invoice Sent', 'Pending Final Payment', 'Job Close Out', 'Close Out In Progress', 'Project Review In Progress', 'Back End Job Audit') THEN 'Accounts Receivable'
    WHEN COALESCE(j.status_name, '') IN ('Sold Job', 'Signed Contract', 'Fully Approved', 'Deductible Collected', 'Production Ready', 'Job Scheduled', 'In Progress', 'In Production', 'Insurance Pending', 'Insurance Pending/Cont Skipped', 'Pre Production Supplementing', 'Future Work', 'Needs Rescheduling', 'City / HOA Approval') THEN 'Production'
    ELSE 'Other'
  END
`;

const STAGE_ORDER: Record<string, number> = {
  Lead: 1,
  "Appointment Scheduled": 2,
  "Appointment Ran": 3,
  Estimating: 4,
  Production: 5,
  "Accounts Receivable": 6,
  Other: 99,
};

const RECORD_TYPE_LABELS: Record<string, string> = {
  retail: "Retail",
  insurance: "Insurance",
  repairs: "Repairs",
  light_commercial: "Light Commercial",
  other: "Other",
};

const TRACKED_RECORD_TYPES = ["repairs", "insurance", "retail", "light_commercial", "other"];

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;
const STATUS_TRANSITIONS = ORDERED_STATUSES.slice(0, -1).map((from, index) => ({
  from,
  to: ORDERED_STATUSES[index + 1],
  index,
}));
const STATUS_TRANSITION_VALUES = STATUS_TRANSITIONS.map(
  (transition) => `(${transition.index}, ${q(transition.from)}, ${q(transition.to)})`
).join(",\n");

interface CurrentStageRow {
  pipeline_stage: string;
  job_count: string;
  pipeline_value: string;
  ar_due: string;
  avg_days_in_status: string | null;
}

interface CurrentStatusRow {
  record_type: string;
  pipeline_stage: string;
  status_name: string;
  job_count: string;
  pipeline_value: string;
  ar_due: string;
  avg_days_in_status: string | null;
}

interface RecordTypeRow {
  record_type: string;
  active_jobs: string;
  pipeline_value: string;
  ar_due: string;
  lead_count: string;
  appointment_scheduled_count: string;
  appointment_ran_count: string;
  estimating_count: string;
  production_count: string;
  ar_job_count: string;
}

interface TimingRow {
  record_type: string;
  from_status: string;
  to_status: string;
  sample_count: string;
  avg_days: string | null;
  median_days: string | null;
  p75_days: string | null;
  p90_days: string | null;
}

interface StageTimingRow {
  record_type: string;
  from_stage: string;
  to_stage: string;
  sample_count: string;
  avg_days: string | null;
  median_days: string | null;
  p75_days: string | null;
  p90_days: string | null;
}

interface ConversionRow {
  record_type: string;
  from_status: string;
  to_status: string;
  from_count: string;
  converted_count: string;
}

interface ForecastRow {
  bucket: string;
  raw_value: string;
  weighted_value: string;
  job_count: string;
}

interface JobRow {
  job_jnid: string;
  job_number: string | null;
  job_name: string;
  record_type: string;
  pipeline_stage: string;
  status_name: string;
  value: string;
  ar_due: string;
  days_in_status: string;
  job_url: string;
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function toInteger(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDays(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

function stageSort(stage: string): number {
  return STAGE_ORDER[stage] ?? 99;
}

function recordTypeLabel(recordType: string): string {
  return RECORD_TYPE_LABELS[recordType] ?? recordType.replaceAll("_", " ");
}

export async function GET(request: NextRequest) {
  try {
    const recordTypeParam = request.nextUrl.searchParams.get("recordType");
    const recordType = recordTypeParam && TRACKED_RECORD_TYPES.includes(recordTypeParam)
      ? recordTypeParam
      : null;
    const recordTypeFilter = recordType ? "AND record_type = $1" : "";
    const recordTypeParams = recordType ? [recordType] : [];

    const [
      currentStages,
      currentStatuses,
      recordTypes,
      timing,
      stageTiming,
      conversions,
      forecast,
      topJobs,
    ] = await Promise.all([
      query<CurrentStageRow>(`
        WITH open_jobs AS (
          SELECT
            ${STAGE_SQL} AS pipeline_stage,
            CASE WHEN ${STAGE_SQL} = 'Accounts Receivable' THEN ${AR_DUE_SQL} ELSE ${VALUE_SQL} END AS value,
            ${AR_DUE_SQL} AS ar_due,
            GREATEST(0, EXTRACT(EPOCH FROM (now() - to_timestamp(COALESCE(j.jn_date_status_change, j.jn_date_created)))) / 86400.0) AS days_in_status,
            ${RECORD_TYPE_SQL} AS record_type
          FROM jobs j
          WHERE ${OPEN_PIPELINE_WHERE}
        )
        SELECT
          pipeline_stage,
          COUNT(*)::text AS job_count,
          COALESCE(SUM(value), 0)::text AS pipeline_value,
          COALESCE(SUM(ar_due), 0)::text AS ar_due,
          AVG(days_in_status)::text AS avg_days_in_status
        FROM open_jobs
        WHERE pipeline_stage <> 'Other'
          ${recordTypeFilter}
        GROUP BY pipeline_stage
      `, recordTypeParams),
      query<CurrentStatusRow>(`
        WITH open_jobs AS (
          SELECT
            ${RECORD_TYPE_SQL} AS record_type,
            ${STAGE_SQL} AS pipeline_stage,
            COALESCE(j.status_name, 'Unknown') AS status_name,
            CASE WHEN ${STAGE_SQL} = 'Accounts Receivable' THEN ${AR_DUE_SQL} ELSE ${VALUE_SQL} END AS value,
            ${AR_DUE_SQL} AS ar_due,
            GREATEST(0, EXTRACT(EPOCH FROM (now() - to_timestamp(COALESCE(j.jn_date_status_change, j.jn_date_created)))) / 86400.0) AS days_in_status
          FROM jobs j
          WHERE ${OPEN_PIPELINE_WHERE}
        )
        SELECT
          record_type,
          pipeline_stage,
          status_name,
          COUNT(*)::text AS job_count,
          COALESCE(SUM(value), 0)::text AS pipeline_value,
          COALESCE(SUM(ar_due), 0)::text AS ar_due,
          AVG(days_in_status)::text AS avg_days_in_status
        FROM open_jobs
        WHERE pipeline_stage <> 'Other'
          ${recordTypeFilter}
        GROUP BY record_type, pipeline_stage, status_name
        ORDER BY pipeline_stage, SUM(value) DESC, COUNT(*) DESC
      `, recordTypeParams),
      query<RecordTypeRow>(`
        WITH open_jobs AS (
          SELECT
            ${RECORD_TYPE_SQL} AS record_type,
            ${STAGE_SQL} AS pipeline_stage,
            CASE WHEN ${STAGE_SQL} = 'Accounts Receivable' THEN ${AR_DUE_SQL} ELSE ${VALUE_SQL} END AS value,
            ${AR_DUE_SQL} AS ar_due
          FROM jobs j
          WHERE ${OPEN_PIPELINE_WHERE}
        )
        SELECT
          record_type,
          COUNT(*)::text AS active_jobs,
          COALESCE(SUM(value), 0)::text AS pipeline_value,
          COALESCE(SUM(ar_due), 0)::text AS ar_due,
          COUNT(*) FILTER (WHERE pipeline_stage = 'Lead')::text AS lead_count,
          COUNT(*) FILTER (WHERE pipeline_stage = 'Appointment Scheduled')::text AS appointment_scheduled_count,
          COUNT(*) FILTER (WHERE pipeline_stage = 'Appointment Ran')::text AS appointment_ran_count,
          COUNT(*) FILTER (WHERE pipeline_stage = 'Estimating')::text AS estimating_count,
          COUNT(*) FILTER (WHERE pipeline_stage = 'Production')::text AS production_count,
          COUNT(*) FILTER (WHERE pipeline_stage = 'Accounts Receivable')::text AS ar_job_count
        FROM open_jobs
        WHERE pipeline_stage <> 'Other'
        GROUP BY record_type
        ORDER BY SUM(value) DESC
      `),
      query<TimingRow>(`
        SELECT
          ${RECORD_TYPE_SQL} AS record_type,
          COALESCE(h.from_stage_name, 'Unknown') AS from_status,
          COALESCE(h.to_stage_name, 'Unknown') AS to_status,
          COUNT(*)::text AS sample_count,
          AVG(EXTRACT(EPOCH FROM h.duration_in_previous_stage) / 86400.0)::text AS avg_days,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM h.duration_in_previous_stage) / 86400.0)::text AS median_days,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM h.duration_in_previous_stage) / 86400.0)::text AS p75_days,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM h.duration_in_previous_stage) / 86400.0)::text AS p90_days
        FROM job_stage_history h
        JOIN jobs j ON j.jnid = h.job_jnid
        WHERE h.changed_at >= DATE '${TIMING_COHORT_START}'
          AND h.duration_in_previous_stage IS NOT NULL
          AND EXTRACT(EPOCH FROM h.duration_in_previous_stage) >= 0
          AND EXTRACT(EPOCH FROM h.duration_in_previous_stage) <= 365 * 86400
          AND ${ACTIVE_REAL_JOB_WHERE}
        GROUP BY record_type, h.from_stage_name, h.to_stage_name
        HAVING COUNT(*) >= 2
        ORDER BY record_type, from_status, to_status
      `),
      query<StageTimingRow>(`
        WITH transitions AS (
          SELECT
            ${RECORD_TYPE_SQL} AS record_type,
            CASE ${Object.entries(STATUS_TO_STAGE).map(([status, stage]) => `WHEN h.from_stage_name = ${q(status)} THEN ${q(stage)}`).join(" ")} ELSE 'Other' END AS from_stage,
            CASE ${Object.entries(STATUS_TO_STAGE).map(([status, stage]) => `WHEN h.to_stage_name = ${q(status)} THEN ${q(stage)}`).join(" ")} ELSE 'Other' END AS to_stage,
            EXTRACT(EPOCH FROM h.duration_in_previous_stage) / 86400.0 AS days
          FROM job_stage_history h
          JOIN jobs j ON j.jnid = h.job_jnid
          WHERE h.changed_at >= DATE '${TIMING_COHORT_START}'
            AND h.duration_in_previous_stage IS NOT NULL
            AND EXTRACT(EPOCH FROM h.duration_in_previous_stage) >= 0
            AND EXTRACT(EPOCH FROM h.duration_in_previous_stage) <= 365 * 86400
            AND ${ACTIVE_REAL_JOB_WHERE}
        )
        SELECT
          record_type,
          from_stage,
          to_stage,
          COUNT(*)::text AS sample_count,
          AVG(days)::text AS avg_days,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY days)::text AS median_days,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY days)::text AS p75_days,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY days)::text AS p90_days
        FROM transitions
        WHERE from_stage <> 'Other'
          AND to_stage <> 'Other'
          AND from_stage <> to_stage
        GROUP BY record_type, from_stage, to_stage
        HAVING COUNT(*) >= 2
        ORDER BY record_type, from_stage, to_stage
      `),
      query<ConversionRow>(`
        WITH transition_defs(sort_order, from_status, to_status) AS (
          VALUES ${STATUS_TRANSITION_VALUES}
        ), cohort AS (
          SELECT j.id, j.jnid, j.status_name, ${RECORD_TYPE_SQL} AS record_type
          FROM jobs j
          WHERE j.jn_date_created >= EXTRACT(EPOCH FROM DATE '${TIMING_COHORT_START}')
            AND ${ACTIVE_REAL_JOB_WHERE}
        ), from_counts AS (
          SELECT
            c.record_type,
            d.from_status,
            d.to_status,
            d.sort_order,
            COUNT(DISTINCT c.id)::text AS from_count
          FROM cohort c
          JOIN transition_defs d ON (
            c.status_name = d.from_status
            OR EXISTS (
              SELECT 1
              FROM job_stage_history h
              WHERE h.job_jnid = c.jnid
                AND (h.from_stage_name = d.from_status OR h.to_stage_name = d.from_status)
            )
          )
          GROUP BY c.record_type, d.from_status, d.to_status, d.sort_order
        ), converted AS (
          SELECT
            c.record_type,
            d.from_status,
            d.to_status,
            COUNT(DISTINCT c.id)::text AS converted_count
          FROM cohort c
          JOIN transition_defs d ON EXISTS (
            SELECT 1
            FROM job_stage_history h
            WHERE h.job_jnid = c.jnid
              AND h.from_stage_name = d.from_status
              AND h.to_stage_name = d.to_status
          )
          GROUP BY c.record_type, d.from_status, d.to_status
        )
        SELECT
          f.record_type,
          f.from_status,
          f.to_status,
          f.from_count,
          COALESCE(c.converted_count, '0') AS converted_count
        FROM from_counts f
        LEFT JOIN converted c ON c.record_type = f.record_type AND c.from_status = f.from_status AND c.to_status = f.to_status
        WHERE f.from_count::int >= 2
        ORDER BY f.record_type, f.sort_order
      `),
      query<ForecastRow>(`
        WITH open_jobs AS (
          SELECT
            ${STAGE_SQL} AS pipeline_stage,
            ${RECORD_TYPE_SQL} AS record_type,
            CASE WHEN ${STAGE_SQL} = 'Accounts Receivable' THEN ${AR_DUE_SQL} ELSE ${VALUE_SQL} END AS value,
            ${AR_DUE_SQL} AS ar_due
          FROM jobs j
          WHERE ${OPEN_PIPELINE_WHERE}
        ), scored AS (
          SELECT
            CASE
              WHEN pipeline_stage = 'Accounts Receivable' THEN 'Bank cash now / collecting'
              WHEN pipeline_stage = 'Production' THEN 'Production money now / soon'
              WHEN pipeline_stage = 'Estimating' THEN 'Potential production after sold'
              WHEN pipeline_stage IN ('Appointment Scheduled', 'Appointment Ran') THEN 'Early pipeline'
              WHEN pipeline_stage = 'Lead' THEN 'Raw leads'
              ELSE 'Other'
            END AS bucket,
            value,
            ar_due,
            CASE
              WHEN pipeline_stage = 'Accounts Receivable' THEN ar_due * 0.85
              WHEN pipeline_stage = 'Production' AND record_type IN ('retail', 'repairs', 'light_commercial') THEN value * 0.70
              WHEN pipeline_stage = 'Production' AND record_type = 'insurance' THEN value * 0.50
              WHEN pipeline_stage = 'Estimating' AND record_type IN ('retail', 'repairs', 'light_commercial') THEN value * 0.28
              WHEN pipeline_stage = 'Estimating' AND record_type = 'insurance' THEN value * 0.18
              WHEN pipeline_stage IN ('Appointment Scheduled', 'Appointment Ran') THEN value * 0.08
              WHEN pipeline_stage = 'Lead' THEN value * 0.03
              ELSE 0
            END AS weighted_value
          FROM open_jobs
          WHERE pipeline_stage <> 'Other'
        )
        SELECT
          bucket,
          COALESCE(SUM(CASE WHEN bucket = 'Bank cash now / collecting' THEN ar_due ELSE value END), 0)::text AS raw_value,
          COALESCE(SUM(weighted_value), 0)::text AS weighted_value,
          COUNT(*)::text AS job_count
        FROM scored
        GROUP BY bucket
        ORDER BY CASE bucket
          WHEN 'Bank cash now / collecting' THEN 1
          WHEN 'Production money now / soon' THEN 2
          WHEN 'Potential production after sold' THEN 3
          WHEN 'Early pipeline' THEN 4
          WHEN 'Raw leads' THEN 5
          ELSE 99
        END
      `),
      query<JobRow>(`
        WITH open_jobs AS (
          SELECT
            j.jnid AS job_jnid,
            j.number AS job_number,
            j.name AS job_name,
            ${RECORD_TYPE_SQL} AS record_type,
            ${STAGE_SQL} AS pipeline_stage,
            COALESCE(j.status_name, 'Unknown') AS status_name,
            CASE WHEN ${STAGE_SQL} = 'Accounts Receivable' THEN ${AR_DUE_SQL} ELSE ${VALUE_SQL} END AS value,
            ${AR_DUE_SQL} AS ar_due,
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - to_timestamp(COALESCE(j.jn_date_status_change, j.jn_date_created)))) / 86400)) AS days_in_status
          FROM jobs j
          WHERE ${OPEN_PIPELINE_WHERE}
        )
        SELECT
          job_jnid,
          job_number,
          job_name,
          record_type,
          pipeline_stage,
          status_name,
          value::text,
          ar_due::text,
          days_in_status::text,
          CONCAT('${JOBNIMBUS_BASE_URL}', job_jnid) AS job_url
        FROM open_jobs
        WHERE pipeline_stage <> 'Other'
          AND (value > 0 OR ar_due > 0 OR pipeline_stage IN ('Lead', 'Appointment Scheduled', 'Appointment Ran'))
          ${recordTypeFilter}
        ORDER BY GREATEST(value, ar_due) DESC, days_in_status DESC
        LIMIT 75
      `, recordTypeParams),
    ]);

    const normalizedStages = currentStages
      .map((row) => ({
        stage: row.pipeline_stage as Stage | "Accounts Receivable" | "Other",
        jobCount: toInteger(row.job_count),
        pipelineValue: toNumber(row.pipeline_value),
        arDue: toNumber(row.ar_due),
        avgDaysInStatus: toDays(row.avg_days_in_status),
      }))
      .sort((a, b) => stageSort(a.stage) - stageSort(b.stage));

    const summary = normalizedStages.reduce(
      (acc, row) => {
        acc.activeJobs += row.jobCount;
        acc.pipelineValue += row.pipelineValue;
        acc.arDue += row.arDue;
        if (row.stage === "Lead") acc.leads = row.jobCount;
        if (row.stage === "Appointment Scheduled") acc.appointmentsScheduled = row.jobCount;
        if (row.stage === "Appointment Ran") acc.appointmentsRan = row.jobCount;
        if (row.stage === "Production") acc.productionJobs = row.jobCount;
        if (row.stage === "Accounts Receivable") acc.accountsReceivableJobs = row.jobCount;
        return acc;
      },
      {
        activeJobs: 0,
        pipelineValue: 0,
        arDue: 0,
        leads: 0,
        appointmentsScheduled: 0,
        appointmentsRan: 0,
        productionJobs: 0,
        accountsReceivableJobs: 0,
      }
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      mode: "current_pipeline_snapshot",
      cohortStart: TIMING_COHORT_START,
      recordTypeFilter: recordType,
      sourceNotes: [
        "Revenue is JobNimbus only. QuickBooks is intentionally not used on this page.",
        "Current pipeline counts are active, non-archived JobNimbus jobs by current status right now, not a period cohort.",
        "Timing and conversion rates use JobNimbus job_stage_history from 2026-01-21 forward.",
        "Accounts Receivable value uses collectible invoice balance due from active JobNimbus invoices in Sent/Open/Closed, not the job-level approved_invoice_due fallback or full historical job value.",
        "Forecast buckets are conservative V1 weights from current JobNimbus stage. Timing and conversion tables are shown so the model can be calibrated against real movement history."
      ],
      summary: {
        ...summary,
        pipelineValue: toNumber(summary.pipelineValue),
        arDue: toNumber(summary.arDue),
      },
      currentStages: normalizedStages,
      currentStatuses: currentStatuses.map((row) => ({
        recordType: row.record_type,
        recordTypeLabel: recordTypeLabel(row.record_type),
        stage: row.pipeline_stage,
        statusName: row.status_name,
        jobCount: toInteger(row.job_count),
        pipelineValue: toNumber(row.pipeline_value),
        arDue: toNumber(row.ar_due),
        avgDaysInStatus: toDays(row.avg_days_in_status),
      })),
      recordTypes: recordTypes.map((row) => ({
        recordType: row.record_type,
        label: recordTypeLabel(row.record_type),
        activeJobs: toInteger(row.active_jobs),
        pipelineValue: toNumber(row.pipeline_value),
        arDue: toNumber(row.ar_due),
        stageCounts: {
          leads: toInteger(row.lead_count),
          appointmentsScheduled: toInteger(row.appointment_scheduled_count),
          appointmentsRan: toInteger(row.appointment_ran_count),
          estimating: toInteger(row.estimating_count),
          production: toInteger(row.production_count),
          accountsReceivable: toInteger(row.ar_job_count),
        },
      })),
      stageTiming: stageTiming.map((row) => ({
        recordType: row.record_type,
        recordTypeLabel: recordTypeLabel(row.record_type),
        fromStage: row.from_stage,
        toStage: row.to_stage,
        sampleCount: toInteger(row.sample_count),
        avgDays: toDays(row.avg_days),
        medianDays: toDays(row.median_days),
        p75Days: toDays(row.p75_days),
        p90Days: toDays(row.p90_days),
      })),
      statusTiming: timing.map((row) => ({
        recordType: row.record_type,
        recordTypeLabel: recordTypeLabel(row.record_type),
        fromStatus: row.from_status,
        toStatus: row.to_status,
        sampleCount: toInteger(row.sample_count),
        avgDays: toDays(row.avg_days),
        medianDays: toDays(row.median_days),
        p75Days: toDays(row.p75_days),
        p90Days: toDays(row.p90_days),
      })),
      statusConversions: conversions.map((row) => {
        const fromCount = toInteger(row.from_count);
        const convertedCount = toInteger(row.converted_count);
        return {
          recordType: row.record_type,
          recordTypeLabel: recordTypeLabel(row.record_type),
          fromStatus: row.from_status,
          toStatus: row.to_status,
          fromCount,
          convertedCount,
          conversionRate: fromCount > 0 ? Math.round((convertedCount / fromCount) * 1000) / 10 : 0,
        };
      }),
      forecastBuckets: forecast.map((row) => ({
        bucket: row.bucket,
        jobCount: toInteger(row.job_count),
        rawValue: toNumber(row.raw_value),
        weightedValue: toNumber(row.weighted_value),
      })),
      topJobs: topJobs.map((row) => ({
        jobJnid: row.job_jnid,
        jobNumber: row.job_number,
        jobName: row.job_name,
        recordType: row.record_type,
        recordTypeLabel: recordTypeLabel(row.record_type),
        stage: row.pipeline_stage,
        statusName: row.status_name,
        value: toNumber(row.value),
        arDue: toNumber(row.ar_due),
        daysInStatus: toInteger(row.days_in_status),
        jobUrl: row.job_url,
      })),
    });
  } catch (err) {
    console.error("[Pipeline API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
