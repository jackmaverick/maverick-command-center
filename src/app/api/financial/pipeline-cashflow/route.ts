import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SEGMENT_SQL } from "@/lib/segment";

type Segment = "retail" | "insurance" | "repairs" | "real_estate" | "warranty" | "other";

type PipelineCashFlowRow = {
  segment: Segment;
  status_name: string;
  job_count: string;
  raw_value: string;
  weighted_30: string;
  weighted_60: string;
  weighted_90: string;
  confidence: string;
};

type TimingRow = {
  segment: Segment;
  transition_key: string;
  sample_count: string;
  avg_days: string | null;
  median_days: string | null;
  p75_days: string | null;
  p90_days: string | null;
};

type ConversionRow = {
  segment: Segment;
  gate: string;
  reached_count: string;
  cohort_count: string;
};

type StuckMoneyRow = {
  job_jnid: string;
  job_number: string | null;
  job_name: string;
  segment: Segment;
  status_name: string;
  value: string;
  days_in_status: string;
  p75_days: string | null;
  job_url: string;
};

type ArRow = {
  segment: Segment;
  invoice_count: string;
  total_due: string;
  weighted_due: string;
  over_30_due: string;
};

type StageCountRow = {
  cash_stage: string;
  job_count: string;
  raw_value: string;
};

const CASHFLOW_COHORT_START = "2026-01-21";
const JOBNIMBUS_BASE_URL = "https://app.jobnimbus.com/job/";

const STAGE_CASE = `
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

const POST_SOLD_CASH_STAGES = "'sold','approval','production_ready','scheduled','production'";

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

function toNumber(value: string | null | undefined): number {
  return Math.round((parseFloat(value ?? "0") || 0) * 100) / 100;
}

function round1(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 10) / 10;
}

export async function GET() {
  try {
    const [summaryRows, pipelineRows, timingRows, conversionRows, stuckRows, arRows, stageCountRows] = await Promise.all([
      query<{
        active_pipeline_value: string;
        active_job_count: string;
        expected_30: string;
        expected_60: string;
        expected_90: string;
        ar_total: string;
        ar_weighted: string;
        estimate_pipeline_value: string;
        sold_pipeline_value: string;
      }>(`
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
          LEFT JOIN jobs j ON j.jnid = i.job_jnid
          WHERE i.is_active = true
            AND i.is_archived = false
            AND COALESCE(i.deleted_at::text, '') = ''
            AND COALESCE(i.status_name, '') <> 'Draft'
            AND COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) > 0
        )
        SELECT
          COALESCE(SUM(value) FILTER (WHERE cash_stage IN (${POST_SOLD_CASH_STAGES}) AND value > 0), 0)::text AS active_pipeline_value,
          COUNT(*) FILTER (WHERE cash_stage IN (${POST_SOLD_CASH_STAGES}))::text AS active_job_count,
          (SELECT ar_weighted FROM ar)::text AS ar_weighted,
          (SELECT ar_total FROM ar)::text AS ar_total,
          COALESCE(SUM(value) FILTER (WHERE cash_stage IN ('estimating','estimate_sent')), 0)::text AS estimate_pipeline_value,
          COALESCE(SUM(value) FILTER (WHERE cash_stage IN (${POST_SOLD_CASH_STAGES}) AND value > 0), 0)::text AS sold_pipeline_value,
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
              END), 0))::text AS expected_90
        FROM open_jobs
      `),
      query<PipelineCashFlowRow>(`
        WITH open_jobs AS (
          SELECT j.*, (${SEGMENT_SQL}) AS segment, ${STAGE_CASE} AS cash_stage, ${VALUE_SQL} AS value
          FROM jobs j
          WHERE j.is_active = true
            AND j.is_archived = false
            AND COALESCE(j.deleted_at::text, '') = ''
            AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
            AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Paid & Closed')
        )
        SELECT
          segment,
          COALESCE(status_name, 'Unknown') AS status_name,
          COUNT(*)::text AS job_count,
          COALESCE(SUM(value), 0)::text AS raw_value,
          COALESCE(SUM(value * CASE
            WHEN cash_stage = 'invoice' THEN 0.80
            WHEN cash_stage = 'production' THEN 0.65
            WHEN cash_stage = 'scheduled' THEN 0.45
            WHEN cash_stage = 'production_ready' THEN 0.35
            WHEN cash_stage = 'approval' THEN 0.20
            WHEN cash_stage = 'sold' AND segment = 'retail' THEN 0.25
            WHEN cash_stage = 'sold' THEN 0.10
            ELSE 0
          END), 0)::text AS weighted_30,
          COALESCE(SUM(value * CASE
            WHEN cash_stage = 'invoice' THEN 0.90
            WHEN cash_stage = 'production' THEN 0.85
            WHEN cash_stage = 'scheduled' THEN 0.75
            WHEN cash_stage = 'production_ready' THEN 0.65
            WHEN cash_stage = 'approval' THEN 0.45
            WHEN cash_stage = 'sold' AND segment = 'retail' THEN 0.55
            WHEN cash_stage = 'sold' THEN 0.28
            ELSE 0
          END), 0)::text AS weighted_60,
          COALESCE(SUM(value * CASE
            WHEN cash_stage = 'invoice' THEN 0.95
            WHEN cash_stage = 'production' THEN 0.92
            WHEN cash_stage = 'scheduled' THEN 0.88
            WHEN cash_stage = 'production_ready' THEN 0.82
            WHEN cash_stage = 'approval' THEN 0.70
            WHEN cash_stage = 'sold' AND segment = 'retail' THEN 0.78
            WHEN cash_stage = 'sold' THEN 0.55
            ELSE 0
          END), 0)::text AS weighted_90,
          CASE
            WHEN cash_stage IN ('invoice','production','scheduled') THEN 'high'
            WHEN cash_stage IN ('sold','approval','production_ready') THEN 'medium'
            ELSE 'low'
          END AS confidence
        FROM open_jobs
        WHERE value > 0
          AND cash_stage IN (${POST_SOLD_CASH_STAGES})
        GROUP BY segment, status_name, cash_stage
        ORDER BY SUM(value) DESC
        LIMIT 40
      `),
      query<TimingRow>(`
        WITH job_gates AS (
          SELECT
            j.id AS job_id,
            j.jnid AS job_jnid,
            (${SEGMENT_SQL}) AS segment,
            to_timestamp(j.jn_date_created) AS lead_at,
            MIN(h.changed_at) FILTER (WHERE h.to_stage_name IN ('Appointment Scheduled', 'Adjuster Appt Scheduled')) AS appointment_at,
            MIN(h.changed_at) FILTER (WHERE h.to_stage_name IN ('Appt Ran', 'Adjuster Appt Ran')) AS appt_ran_at,
            MIN(h.changed_at) FILTER (WHERE h.to_stage_name IN ('Estimating', 'Scope Approval')) AS estimating_at,
            MIN(h.changed_at) FILTER (WHERE h.to_stage_name IN ('Estimate Sent')) AS estimate_sent_at,
            MIN(h.changed_at) FILTER (WHERE h.to_stage_name IN ('Sold Job', 'Signed Contract', 'Contingency Signed', 'Fully Approved')) AS sold_at,
            MIN(h.changed_at) FILTER (WHERE h.to_stage_name IN ('Production Ready', 'Job Scheduled', 'In Production', 'In Progress')) AS production_at,
            MIN(to_timestamp(i.date_invoice)) FILTER (WHERE i.date_invoice IS NOT NULL AND COALESCE(i.status_name, '') <> 'Draft') AS invoice_at,
            MIN(to_timestamp(COALESCE(i.date_paid_in_full, i.first_payment_date))) FILTER (WHERE COALESCE(i.date_paid_in_full, i.first_payment_date) IS NOT NULL) AS paid_at
          FROM jobs j
          LEFT JOIN job_stage_history h ON h.job_jnid = j.jnid
          LEFT JOIN invoices i ON i.job_jnid = j.jnid AND i.is_active = true AND i.is_archived = false
          WHERE j.jn_date_created >= EXTRACT(EPOCH FROM DATE '${CASHFLOW_COHORT_START}')
            AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
          GROUP BY j.id, j.jnid, segment, j.jn_date_created
        ), transitions AS (
          SELECT segment, 'lead_to_estimate' AS transition_key, EXTRACT(EPOCH FROM (COALESCE(estimate_sent_at, estimating_at) - lead_at)) / 86400 AS days FROM job_gates WHERE lead_at IS NOT NULL AND COALESCE(estimate_sent_at, estimating_at) IS NOT NULL
          UNION ALL SELECT segment, 'estimate_to_sold', EXTRACT(EPOCH FROM (sold_at - COALESCE(estimate_sent_at, estimating_at))) / 86400 FROM job_gates WHERE sold_at IS NOT NULL AND COALESCE(estimate_sent_at, estimating_at) IS NOT NULL
          UNION ALL SELECT segment, 'sold_to_production', EXTRACT(EPOCH FROM (production_at - sold_at)) / 86400 FROM job_gates WHERE production_at IS NOT NULL AND sold_at IS NOT NULL
          UNION ALL SELECT segment, 'sold_to_invoice', EXTRACT(EPOCH FROM (invoice_at - sold_at)) / 86400 FROM job_gates WHERE invoice_at IS NOT NULL AND sold_at IS NOT NULL
          UNION ALL SELECT segment, 'invoice_to_paid', EXTRACT(EPOCH FROM (paid_at - invoice_at)) / 86400 FROM job_gates WHERE paid_at IS NOT NULL AND invoice_at IS NOT NULL
          UNION ALL SELECT segment, 'sold_to_paid', EXTRACT(EPOCH FROM (paid_at - sold_at)) / 86400 FROM job_gates WHERE paid_at IS NOT NULL AND sold_at IS NOT NULL
        )
        SELECT
          segment,
          transition_key,
          COUNT(*)::text AS sample_count,
          AVG(days)::text AS avg_days,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY days)::text AS median_days,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY days)::text AS p75_days,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY days)::text AS p90_days
        FROM transitions
        WHERE days >= 0 AND days <= 365
        GROUP BY segment, transition_key
        ORDER BY segment, transition_key
      `),
      query<ConversionRow>(`
        WITH cohort AS (
          SELECT j.id, j.jnid, (${SEGMENT_SQL}) AS segment
          FROM jobs j
          WHERE j.jn_date_created >= EXTRACT(EPOCH FROM DATE '${CASHFLOW_COHORT_START}')
            AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
        ), reached AS (
          SELECT c.segment, c.id,
            BOOL_OR(h.to_stage_name IN ('Estimate Sent', 'Estimating', 'Scope Approval')) AS reached_estimate,
            BOOL_OR(h.to_stage_name IN ('Sold Job', 'Signed Contract', 'Contingency Signed', 'Fully Approved')) AS reached_sold,
            BOOL_OR(h.to_stage_name IN ('Invoiced', 'Final Invoice Sent', 'Final Invoicing', 'Pending Final Payment')) AS reached_invoice,
            BOOL_OR(h.to_stage_name = 'Paid & Closed') AS reached_paid
          FROM cohort c
          LEFT JOIN job_stage_history h ON h.job_jnid = c.jnid
          GROUP BY c.segment, c.id
        ), gates AS (
          SELECT segment, 'estimate' AS gate, COUNT(*) FILTER (WHERE reached_estimate)::text AS reached_count, COUNT(*)::text AS cohort_count FROM reached GROUP BY segment
          UNION ALL SELECT segment, 'sold', COUNT(*) FILTER (WHERE reached_sold)::text, COUNT(*)::text FROM reached GROUP BY segment
          UNION ALL SELECT segment, 'invoice', COUNT(*) FILTER (WHERE reached_invoice)::text, COUNT(*)::text FROM reached GROUP BY segment
          UNION ALL SELECT segment, 'paid', COUNT(*) FILTER (WHERE reached_paid)::text, COUNT(*)::text FROM reached GROUP BY segment
        ) SELECT * FROM gates ORDER BY segment, gate
      `),
      query<StuckMoneyRow>(`
        WITH open_jobs AS (
          SELECT
            j.jnid AS job_jnid,
            j.number AS job_number,
            j.name AS job_name,
            (${SEGMENT_SQL}) AS segment,
            COALESCE(j.status_name, 'Unknown') AS status_name,
            ${STAGE_CASE} AS cash_stage,
            ${VALUE_SQL} AS value,
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - to_timestamp(COALESCE(j.jn_date_status_change, j.jn_date_created)))) / 86400)) AS days_in_status
          FROM jobs j
          WHERE j.is_active = true
            AND j.is_archived = false
            AND COALESCE(j.deleted_at::text, '') = ''
            AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
            AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Paid & Closed')
        ), thresholds AS (
          SELECT * FROM (VALUES
            ('retail', 'sold', 14), ('retail', 'approval', 14), ('retail', 'production_ready', 7), ('retail', 'scheduled', 14), ('retail', 'production', 10), ('retail', 'invoice', 14),
            ('insurance', 'sold', 30), ('insurance', 'approval', 21), ('insurance', 'production_ready', 14), ('insurance', 'scheduled', 21), ('insurance', 'production', 21), ('insurance', 'invoice', 35),
            ('repairs', 'sold', 14), ('repairs', 'approval', 14), ('repairs', 'production_ready', 7), ('repairs', 'scheduled', 10), ('repairs', 'production', 7), ('repairs', 'invoice', 14),
            ('real_estate', 'sold', 14), ('real_estate', 'approval', 14), ('real_estate', 'production_ready', 7), ('real_estate', 'scheduled', 14), ('real_estate', 'production', 10), ('real_estate', 'invoice', 14)
          ) AS t(segment, cash_stage, p75_days)
        )
        SELECT
          o.job_jnid,
          o.job_number,
          o.job_name,
          o.segment,
          o.status_name,
          o.value::text,
          o.days_in_status::text,
          t.p75_days::text,
          CONCAT('${JOBNIMBUS_BASE_URL}', o.job_jnid) AS job_url
        FROM open_jobs o
        LEFT JOIN thresholds t ON t.segment = o.segment AND t.cash_stage = o.cash_stage
        WHERE o.value >= 2500
          AND o.cash_stage IN (${POST_SOLD_CASH_STAGES})
          AND o.days_in_status > COALESCE(t.p75_days, 21)
        ORDER BY o.value DESC
        LIMIT 25
      `),
      query<ArRow>(`
        SELECT
          (${SEGMENT_SQL}) AS segment,
          COUNT(*)::text AS invoice_count,
          COALESCE(SUM(COALESCE(i.due, i.total - COALESCE(i.total_paid, 0))), 0)::text AS total_due,
          COALESCE(SUM(COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) *
            CASE
              WHEN EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created))) <= 30 THEN 0.90
              WHEN EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created))) <= 60 THEN 0.70
              WHEN EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created))) <= 90 THEN 0.40
              ELSE 0.15
            END), 0)::text AS weighted_due,
          COALESCE(SUM(COALESCE(i.due, i.total - COALESCE(i.total_paid, 0))) FILTER (WHERE EXTRACT(DAY FROM now() - to_timestamp(COALESCE(i.date_invoice, i.jn_date_created))) > 30), 0)::text AS over_30_due
        FROM invoices i
        LEFT JOIN jobs j ON j.jnid = i.job_jnid
        WHERE i.is_active = true
          AND i.is_archived = false
          AND COALESCE(i.deleted_at::text, '') = ''
          AND COALESCE(i.status_name, '') <> 'Draft'
          AND COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) > 0
        GROUP BY segment
        ORDER BY total_due DESC
      `),
      query<StageCountRow>(`
        WITH open_jobs AS (
          SELECT ${STAGE_CASE} AS cash_stage, ${VALUE_SQL} AS value
          FROM jobs j
          WHERE j.is_active = true
            AND j.is_archived = false
            AND COALESCE(j.deleted_at::text, '') = ''
            AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
            AND COALESCE(j.status_name, '') NOT IN ('Lost', 'Paid & Closed')
        )
        SELECT
          cash_stage,
          COUNT(*)::text AS job_count,
          COALESCE(SUM(value), 0)::text AS raw_value
        FROM open_jobs
        WHERE cash_stage IN (${POST_SOLD_CASH_STAGES})
        GROUP BY cash_stage
        ORDER BY CASE cash_stage
          WHEN 'sold' THEN 1
          WHEN 'approval' THEN 2
          WHEN 'production_ready' THEN 3
          WHEN 'scheduled' THEN 4
          WHEN 'production' THEN 5
          ELSE 99
        END
      `),
    ]);

    const summary = summaryRows[0] ?? {
      active_pipeline_value: "0",
      active_job_count: "0",
      expected_30: "0",
      expected_60: "0",
      expected_90: "0",
      ar_total: "0",
      ar_weighted: "0",
      estimate_pipeline_value: "0",
      sold_pipeline_value: "0",
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      cohortStart: CASHFLOW_COHORT_START,
      sourceNotes: [
        "JobNimbus/Supabase pipeline values are separate from QBO cash balance.",
        "This page now focuses on signed/post-sold open work: Sold Job/Fully Approved/Future Work, deductible/supplement/approval blockers, Production Ready, Scheduled, and In Production. Invoices are handled in AR and not counted again as pipeline.",
        "Estimate Sent and earlier pipeline is shown as excluded context, not included in expected cash.",
        "Timing coverage begins with job_stage_history around 2026-01-21, so pre-2026 movement is not used.",
      ],
      summary: {
        activePipelineValue: toNumber(summary.active_pipeline_value),
        activeJobCount: parseInt(summary.active_job_count, 10) || 0,
        arTotal: toNumber(summary.ar_total),
        arWeighted: toNumber(summary.ar_weighted),
        estimatePipelineValue: toNumber(summary.estimate_pipeline_value),
        soldPipelineValue: toNumber(summary.sold_pipeline_value),
        expectedCash: {
          next30: toNumber(summary.expected_30),
          next60: toNumber(summary.expected_60),
          next90: toNumber(summary.expected_90),
        },
      },
      stageCounts: stageCountRows.map((row) => ({
        stage: row.cash_stage,
        jobCount: parseInt(row.job_count, 10) || 0,
        rawValue: toNumber(row.raw_value),
      })),
      arBySegment: arRows.map((row) => ({
        segment: row.segment,
        invoiceCount: parseInt(row.invoice_count, 10),
        totalDue: toNumber(row.total_due),
        weightedDue: toNumber(row.weighted_due),
        over30Due: toNumber(row.over_30_due),
      })),
      pipelineByStage: pipelineRows.map((row) => ({
        segment: row.segment,
        statusName: row.status_name,
        jobCount: parseInt(row.job_count, 10),
        rawValue: toNumber(row.raw_value),
        weighted30: toNumber(row.weighted_30),
        weighted60: toNumber(row.weighted_60),
        weighted90: toNumber(row.weighted_90),
        confidence: row.confidence,
      })),
      timing: timingRows.map((row) => ({
        segment: row.segment,
        transitionKey: row.transition_key,
        sampleCount: parseInt(row.sample_count, 10),
        avgDays: round1(row.avg_days),
        medianDays: round1(row.median_days),
        p75Days: round1(row.p75_days),
        p90Days: round1(row.p90_days),
      })),
      conversionMatrix: conversionRows.map((row) => {
        const reached = parseInt(row.reached_count, 10);
        const cohort = parseInt(row.cohort_count, 10);
        return {
          segment: row.segment,
          gate: row.gate,
          reachedCount: reached,
          cohortCount: cohort,
          rate: cohort > 0 ? Math.round((reached / cohort) * 1000) / 10 : 0,
        };
      }),
      stuckMoney: stuckRows.map((row) => ({
        jobJnid: row.job_jnid,
        jobNumber: row.job_number,
        jobName: row.job_name,
        segment: row.segment,
        statusName: row.status_name,
        value: toNumber(row.value),
        daysInStatus: parseInt(row.days_in_status, 10),
        p75Days: row.p75_days ? parseInt(row.p75_days, 10) : null,
        jobUrl: row.job_url,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Pipeline Cashflow API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
