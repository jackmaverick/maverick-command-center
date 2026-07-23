import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const RECORD_TYPES = ["Retail", "Insurance", "Repairs"] as const;
type RecordType = (typeof RECORD_TYPES)[number];

type CashBucketKey = "next30" | "next60" | "next90" | "later";

interface StatusValueRow {
  record_type_name: RecordType;
  status_name: string;
  jobs: string;
  value: string;
}

interface TransitionRow {
  record_type_name: RecordType;
  from_stage: string;
  to_stage: string;
  jobs: string;
  avg_days: string | null;
  median_days: string | null;
  p75_days: string | null;
  p90_days: string | null;
}

interface ConversionRow {
  record_type_name: RecordType;
  from_stage: string;
  to_stage: string;
  from_jobs: string;
  converted_jobs: string;
  conversion_rate: string;
}

interface TimingSummaryRow {
  record_type_name: RecordType;
  jobs: string;
  with_estimate: string;
  lead_to_estimate_days: string | null;
  appt_sched_to_ran_days: string | null;
  estimating_to_sent_days: string | null;
  sold_jobs: string;
  sold_over_leads_pct: string | null;
  sold_over_estimates_pct: string | null;
  sold_to_install_days: string | null;
  sold_to_invoice_days: string | null;
  invoice_to_paid_days: string | null;
  sold_to_paid_days: string | null;
  pipeline_value: string | null;
}

interface OpenCashRow {
  record_type_name: RecordType;
  status_name: string;
  job_jnid: string;
  job_number: string | null;
  job_name: string;
  value: string;
  invoice_due: string | null;
  last_invoice_date: string | null;
}

interface StuckJobRow {
  record_type_name: RecordType;
  status_name: string;
  job_jnid: string;
  job_number: string | null;
  job_name: string;
  sales_rep_name: string | null;
  value: string;
  entered_at: string | null;
  age_days: string;
}

const TRANSITIONS: [string, string][] = [
  ["Lead", "Appointment Scheduled"],
  ["Appointment Scheduled", "Appt Ran"],
  ["Appt Ran", "Estimating"],
  ["Appointment Scheduled", "Estimating"],
  ["Estimating", "Estimate Sent"],
  ["Estimate Sent", "Sold Job"],
  ["Sold Job", "Production Ready"],
  ["Sold Job", "Invoiced"],
  ["Invoiced", "Paid & Closed"],
  ["Sold Job", "Paid & Closed"],
];

const SOLD_OR_LATER = [
  "Sold Job",
  "Production Ready",
  "Job Scheduled",
  "In Production",
  "Insurance Pending",
  "Future Work",
  "Needs Rescheduling",
  "Invoiced",
  "Final Invoicing",
  "Final Invoice Sent",
  "Pending Final Payment",
  "Job Close Out",
  "Close Out In Progress",
  "Paid & Closed",
  "All Work Completed",
  "All Work Complete",
  "Job Completed",
  "Warranty Complete",
  "Deductible Invoice Sent",
  "Deductible Collected",
  "Fully Approved",
  "Pre Production Supplementing",
  "Waiting on Supplements",
  "Work Completed Approved",
];

const ESTIMATE_STATUSES = ["Estimating", "Estimate Sent", "Appt Ran"];
const LOSS_STATUSES = ["Lost", "Dead", "Cold", "Cold Lead"];

const DEFAULT_DAYS_TO_PAID: Record<RecordType, number> = {
  Retail: 34,
  Insurance: 69,
  Repairs: 37,
};

const STATUS_THRESHOLDS: Record<string, Partial<Record<RecordType, number>>> = {
  "Appointment Scheduled": { Retail: 10, Insurance: 11, Repairs: 14 },
  "Appt Ran": { Retail: 5, Insurance: 5, Repairs: 5 },
  Estimating: { Retail: 3, Insurance: 4, Repairs: 7 },
  "Estimate Sent": { Retail: 7, Insurance: 14, Repairs: 7 },
  "Sold Job": { Retail: 14, Insurance: 30, Repairs: 7 },
  "Production Ready": { Retail: 14, Insurance: 30, Repairs: 7 },
  "Job Scheduled": { Retail: 14, Insurance: 30, Repairs: 7 },
  "In Production": { Retail: 14, Insurance: 30, Repairs: 7 },
  Invoiced: { Retail: 14, Insurance: 30, Repairs: 14 },
  "Final Invoicing": { Retail: 14, Insurance: 30, Repairs: 14 },
  "Final Invoice Sent": { Retail: 21, Insurance: 30, Repairs: 14 },
  "Pending Final Payment": { Retail: 21, Insurance: 30, Repairs: 14 },
  "Deductible Invoice Sent": { Insurance: 14 },
  "Insurance Pending/Cont Skipped": { Insurance: 30 },
  "Pre Production Supplementing": { Insurance: 30 },
  "Waiting on Supplements": { Insurance: 30 },
  "Close Out In Progress": { Insurance: 21 },
};

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function bucketForDate(date: Date): CashBucketKey {
  const now = new Date();
  const diffDays = (date.getTime() - now.getTime()) / 86400000;
  if (diffDays <= 30) return "next30";
  if (diffDays <= 60) return "next60";
  if (diffDays <= 90) return "next90";
  return "later";
}

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function thresholdFor(recordType: RecordType, status: string): number {
  return STATUS_THRESHOLDS[status]?.[recordType] ?? (recordType === "Insurance" ? 30 : 14);
}

function jobUrl(jnid: string): string {
  return `https://app.jobnimbus.com/jobs/${jnid}`;
}

function valuesSql(): { sql: string; params: string[] } {
  const params = TRANSITIONS.flatMap(([from, to]) => [from, to]);
  const pairs = TRANSITIONS.map((_, i) => `($${i * 2 + 1}::text, $${i * 2 + 2}::text)`).join(", ");
  return { sql: pairs, params };
}

export async function GET() {
  try {
    const pairValues = valuesSql();

    const [statusRows, transitionRows, conversionRows, timingRows, openCashRows, stuckRows] = await Promise.all([
      query<StatusValueRow>(
        `SELECT
           j.record_type_name,
           j.status_name,
           COUNT(*)::text AS jobs,
           COALESCE(SUM(GREATEST(
             COALESCE(j.approved_estimate_total, 0),
             COALESCE(j.approved_invoice_total, 0),
             COALESCE(j.last_estimate, 0),
             COALESCE(j.last_invoice, 0)
           )), 0)::text AS value
         FROM jobs j
         WHERE COALESCE(j.is_active, true) = true
           AND COALESCE(j.is_archived, false) = false
           AND j.deleted_at IS NULL
           AND j.record_type_name = ANY($1::text[])
           AND LOWER(COALESCE(j.name, '')) NOT LIKE '%test%'
           AND COALESCE(j.status_name, '') <> ALL($2::text[])
         GROUP BY j.record_type_name, j.status_name
         ORDER BY j.record_type_name, SUM(GREATEST(
           COALESCE(j.approved_estimate_total, 0),
           COALESCE(j.approved_invoice_total, 0),
           COALESCE(j.last_estimate, 0),
           COALESCE(j.last_invoice, 0)
         )) DESC`,
        [[...RECORD_TYPES], LOSS_STATUSES]
      ),

      query<TransitionRow>(
        `WITH pairs(from_s, to_s) AS (
           VALUES ${pairValues.sql}
         ), transitions AS (
           SELECT
             j.record_type_name,
             p.from_s AS from_stage,
             p.to_s AS to_stage,
             h_from.job_jnid,
             EXTRACT(EPOCH FROM (MIN(h_to.changed_at) - MAX(h_from.changed_at))) / 86400.0 AS days_diff
           FROM pairs p
           JOIN job_stage_history h_from ON h_from.to_stage_name = p.from_s
           JOIN job_stage_history h_to
             ON h_to.job_jnid = h_from.job_jnid
            AND h_to.to_stage_name = p.to_s
            AND h_to.changed_at > h_from.changed_at
           JOIN jobs j ON j.jnid = h_from.job_jnid
           WHERE j.record_type_name = ANY($${pairValues.params.length + 1}::text[])
             AND COALESCE(j.is_archived, false) = false
             AND j.deleted_at IS NULL
           GROUP BY j.record_type_name, p.from_s, p.to_s, h_from.job_jnid
         )
         SELECT
           record_type_name,
           from_stage,
           to_stage,
           COUNT(*)::text AS jobs,
           ROUND(AVG(days_diff)::numeric, 1)::text AS avg_days,
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY days_diff)::numeric, 1)::text AS median_days,
           ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY days_diff)::numeric, 1)::text AS p75_days,
           ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY days_diff)::numeric, 1)::text AS p90_days
         FROM transitions
         WHERE days_diff >= 0
         GROUP BY record_type_name, from_stage, to_stage
         ORDER BY record_type_name, from_stage, to_stage`,
        [...pairValues.params, [...RECORD_TYPES]]
      ),

      query<ConversionRow>(
        `WITH pairs(from_s, to_s) AS (
           VALUES ${pairValues.sql}
         ), reached AS (
           SELECT DISTINCT j.record_type_name, j.jnid, h.to_stage_name
           FROM jobs j
           JOIN job_stage_history h ON h.job_jnid = j.jnid
           WHERE j.record_type_name = ANY($${pairValues.params.length + 1}::text[])
             AND COALESCE(j.is_archived, false) = false
             AND j.deleted_at IS NULL
         ), counts AS (
           SELECT
             r.record_type_name,
             p.from_s AS from_stage,
             p.to_s AS to_stage,
             COUNT(DISTINCT r.jnid) FILTER (WHERE r.to_stage_name = p.from_s)::numeric AS from_jobs,
             COUNT(DISTINCT r_to.jnid)::numeric AS converted_jobs
           FROM pairs p
           JOIN reached r ON r.to_stage_name = p.from_s
           LEFT JOIN reached r_to
             ON r_to.jnid = r.jnid
            AND r_to.to_stage_name = p.to_s
           GROUP BY r.record_type_name, p.from_s, p.to_s
         )
         SELECT
           record_type_name,
           from_stage,
           to_stage,
           from_jobs::text,
           converted_jobs::text,
           ROUND((converted_jobs / NULLIF(from_jobs, 0)) * 100, 1)::text AS conversion_rate
         FROM counts
         WHERE from_jobs > 0
         ORDER BY record_type_name, from_stage, to_stage`,
        [...pairValues.params, [...RECORD_TYPES]]
      ),

      query<TimingSummaryRow>(
        `WITH clean_jobs AS (
           SELECT
             id,
             jnid,
             record_type_name,
             status_name,
             jn_date_created,
             approved_estimate_total,
             approved_invoice_total,
             last_estimate,
             last_invoice
           FROM jobs
           WHERE COALESCE(is_archived, false) = false
             AND COALESCE(is_active, true) = true
             AND deleted_at IS NULL
             AND record_type_name = ANY($1::text[])
             AND LOWER(COALESCE(name, '')) NOT LIKE '%test%'
         ), first_stage AS (
           SELECT job_jnid, to_stage_name, MIN(changed_at) first_at
           FROM job_stage_history
           GROUP BY job_jnid, to_stage_name
         ), per_job AS (
           SELECT
             j.record_type_name,
             j.jnid,
             to_timestamp(j.jn_date_created) created_at,
             (SELECT MIN(e.jn_date_created) FROM estimates e WHERE e.job_jnid = j.jnid AND COALESCE(e.is_archived,false)=false AND COALESCE(e.is_active,true)=true) first_estimate_created,
             (SELECT MIN(i.date_invoice) FROM invoices i WHERE i.job_jnid = j.jnid AND COALESCE(i.is_archived,false)=false AND COALESCE(i.is_active,true)=true AND COALESCE(i.total,0)>0) first_invoice,
             (SELECT MIN(COALESCE(i.date_paid_in_full,0)) FROM invoices i WHERE i.job_jnid = j.jnid AND COALESCE(i.date_paid_in_full,0)>0 AND COALESCE(i.is_archived,false)=false AND COALESCE(i.is_active,true)=true) first_paid_full,
             (SELECT MIN(w.date_start) FROM work_orders w WHERE w.job_jnid = j.jnid AND COALESCE(w.is_archived,false)=false AND COALESCE(w.is_active,true)=true AND w.date_start IS NOT NULL) first_install,
             fs_appt.first_at appt_scheduled_at,
             fs_ran.first_at appt_ran_at,
             fs_est.first_at estimating_at,
             fs_sent.first_at estimate_sent_at,
             fs_sold.first_at sold_at,
             GREATEST(COALESCE(j.approved_estimate_total,0), COALESCE(j.approved_invoice_total,0), COALESCE(j.last_estimate,0), COALESCE(j.last_invoice,0)) value
           FROM clean_jobs j
           LEFT JOIN first_stage fs_appt ON fs_appt.job_jnid=j.jnid AND fs_appt.to_stage_name='Appointment Scheduled'
           LEFT JOIN first_stage fs_ran ON fs_ran.job_jnid=j.jnid AND fs_ran.to_stage_name='Appt Ran'
           LEFT JOIN first_stage fs_est ON fs_est.job_jnid=j.jnid AND fs_est.to_stage_name='Estimating'
           LEFT JOIN first_stage fs_sent ON fs_sent.job_jnid=j.jnid AND fs_sent.to_stage_name='Estimate Sent'
           LEFT JOIN first_stage fs_sold ON fs_sold.job_jnid=j.jnid AND fs_sold.to_stage_name='Sold Job'
           WHERE j.jn_date_created >= EXTRACT(EPOCH FROM timestamp '2026-01-01')
         )
         SELECT
           record_type_name,
           COUNT(*)::text jobs,
           COUNT(first_estimate_created)::text with_estimate,
           ROUND(AVG(EXTRACT(EPOCH FROM (first_estimate_created-created_at))/86400.0) FILTER (WHERE first_estimate_created IS NOT NULL AND first_estimate_created>created_at)::numeric,1)::text lead_to_estimate_days,
           ROUND(AVG(EXTRACT(EPOCH FROM (appt_ran_at-appt_scheduled_at))/86400.0) FILTER (WHERE appt_scheduled_at IS NOT NULL AND appt_ran_at IS NOT NULL AND appt_ran_at>appt_scheduled_at)::numeric,1)::text appt_sched_to_ran_days,
           ROUND(AVG(EXTRACT(EPOCH FROM (estimate_sent_at-estimating_at))/86400.0) FILTER (WHERE estimating_at IS NOT NULL AND estimate_sent_at IS NOT NULL AND estimate_sent_at>estimating_at)::numeric,1)::text estimating_to_sent_days,
           COUNT(sold_at)::text sold_jobs,
           ROUND(COUNT(sold_at)::numeric/NULLIF(COUNT(*),0)*100,1)::text sold_over_leads_pct,
           ROUND(COUNT(sold_at)::numeric/NULLIF(COUNT(first_estimate_created),0)*100,1)::text sold_over_estimates_pct,
           ROUND(AVG((first_install - EXTRACT(EPOCH FROM sold_at))/86400.0) FILTER (WHERE sold_at IS NOT NULL AND first_install IS NOT NULL AND first_install > EXTRACT(EPOCH FROM sold_at))::numeric,1)::text sold_to_install_days,
           ROUND(AVG((first_invoice - EXTRACT(EPOCH FROM sold_at))/86400.0) FILTER (WHERE sold_at IS NOT NULL AND first_invoice IS NOT NULL AND first_invoice > EXTRACT(EPOCH FROM sold_at))::numeric,1)::text sold_to_invoice_days,
           ROUND(AVG((first_paid_full - first_invoice)/86400.0) FILTER (WHERE first_paid_full IS NOT NULL AND first_invoice IS NOT NULL AND first_paid_full > first_invoice)::numeric,1)::text invoice_to_paid_days,
           ROUND(AVG((first_paid_full - EXTRACT(EPOCH FROM sold_at))/86400.0) FILTER (WHERE sold_at IS NOT NULL AND first_paid_full IS NOT NULL AND first_paid_full > EXTRACT(EPOCH FROM sold_at))::numeric,1)::text sold_to_paid_days,
           ROUND(SUM(value),0)::text pipeline_value
         FROM per_job
         GROUP BY record_type_name
         ORDER BY jobs::int DESC`,
        [[...RECORD_TYPES]]
      ),

      query<OpenCashRow>(
        `SELECT
           j.record_type_name,
           j.status_name,
           j.jnid AS job_jnid,
           j.number AS job_number,
           j.name AS job_name,
           COALESCE(NULLIF(i.due, 0), i.total - COALESCE(i.total_paid, 0), 0)::text AS value,
           i.date_due::text AS invoice_due,
           i.date_invoice::text AS last_invoice_date
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND COALESCE(i.is_archived, false) = false
           AND i.deleted_at IS NULL
           AND j.record_type_name = ANY($1::text[])
           AND COALESCE(i.due, i.total - COALESCE(i.total_paid, 0), 0) > 0
           AND LOWER(COALESCE(j.name, '')) NOT LIKE '%test%'
         ORDER BY COALESCE(i.due, i.total - COALESCE(i.total_paid, 0), 0) DESC
         LIMIT 250`,
        [[...RECORD_TYPES]]
      ),

      query<StuckJobRow>(
        `WITH entered AS (
           SELECT DISTINCT ON (h.job_jnid, h.to_stage_name)
             h.job_jnid,
             h.to_stage_name,
             h.changed_at
           FROM job_stage_history h
           ORDER BY h.job_jnid, h.to_stage_name, h.changed_at DESC
         )
         SELECT
           j.record_type_name,
           j.status_name,
           j.jnid AS job_jnid,
           j.number AS job_number,
           j.name AS job_name,
           j.sales_rep_name,
           GREATEST(COALESCE(j.approved_estimate_total, 0), COALESCE(j.approved_invoice_total, 0), COALESCE(j.last_estimate, 0), COALESCE(j.last_invoice, 0))::text AS value,
           COALESCE(e.changed_at, to_timestamp(j.jn_date_status_change), to_timestamp(j.jn_date_updated), to_timestamp(j.jn_date_created))::text AS entered_at,
           ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(e.changed_at, to_timestamp(j.jn_date_status_change), to_timestamp(j.jn_date_updated), to_timestamp(j.jn_date_created)))) / 86400.0, 1)::text AS age_days
         FROM jobs j
         LEFT JOIN entered e ON e.job_jnid = j.jnid AND e.to_stage_name = j.status_name
         WHERE COALESCE(j.is_active, true) = true
           AND COALESCE(j.is_archived, false) = false
           AND j.deleted_at IS NULL
           AND j.record_type_name = ANY($1::text[])
           AND COALESCE(j.status_name, '') <> ALL($2::text[])
           AND LOWER(COALESCE(j.name, '')) NOT LIKE '%test%'
           AND GREATEST(COALESCE(j.approved_estimate_total, 0), COALESCE(j.approved_invoice_total, 0), COALESCE(j.last_estimate, 0), COALESCE(j.last_invoice, 0)) > 0
         ORDER BY GREATEST(COALESCE(j.approved_estimate_total, 0), COALESCE(j.approved_invoice_total, 0), COALESCE(j.last_estimate, 0), COALESCE(j.last_invoice, 0)) DESC
         LIMIT 300`,
        [[...RECORD_TYPES], ["Paid & Closed", ...LOSS_STATUSES]]
      ),
    ]);

    const statusValue = statusRows.map((row) => ({
      recordType: row.record_type_name,
      status: row.status_name,
      jobs: parseInt(row.jobs, 10),
      value: Math.round(toNumber(row.value)),
    }));

    const transitions = transitionRows.map((row) => ({
      recordType: row.record_type_name,
      from: row.from_stage,
      to: row.to_stage,
      jobs: parseInt(row.jobs, 10),
      avgDays: toNumber(row.avg_days),
      medianDays: toNumber(row.median_days),
      p75Days: toNumber(row.p75_days),
      p90Days: toNumber(row.p90_days),
    }));

    const conversions = conversionRows.map((row) => ({
      recordType: row.record_type_name,
      from: row.from_stage,
      to: row.to_stage,
      fromJobs: parseInt(row.from_jobs, 10),
      convertedJobs: parseInt(row.converted_jobs, 10),
      conversionRate: toNumber(row.conversion_rate),
    }));

    const timingByRecordType = timingRows.map((row) => ({
      recordType: row.record_type_name,
      jobs: parseInt(row.jobs, 10),
      withEstimate: parseInt(row.with_estimate, 10),
      leadToEstimateDays: row.lead_to_estimate_days ? toNumber(row.lead_to_estimate_days) : null,
      appointmentToRanDays: row.appt_sched_to_ran_days ? toNumber(row.appt_sched_to_ran_days) : null,
      estimatingToSentDays: row.estimating_to_sent_days ? toNumber(row.estimating_to_sent_days) : null,
      soldJobs: parseInt(row.sold_jobs, 10),
      soldOverLeadsPct: row.sold_over_leads_pct ? toNumber(row.sold_over_leads_pct) : null,
      soldOverEstimatesPct: row.sold_over_estimates_pct ? toNumber(row.sold_over_estimates_pct) : null,
      soldToInstallDays: row.sold_to_install_days ? toNumber(row.sold_to_install_days) : null,
      soldToInvoiceDays: row.sold_to_invoice_days ? toNumber(row.sold_to_invoice_days) : null,
      invoiceToPaidDays: row.invoice_to_paid_days ? toNumber(row.invoice_to_paid_days) : null,
      soldToPaidDays: row.sold_to_paid_days ? toNumber(row.sold_to_paid_days) : null,
      pipelineValue: Math.round(toNumber(row.pipeline_value)),
    }));

    const timingMap = Object.fromEntries(
      timingByRecordType.map((row) => [row.recordType, row])
    ) as Record<RecordType, (typeof timingByRecordType)[number]>;

    const cashBuckets: Record<
      CashBucketKey,
      { ar: number; soldPipeline: number; estimatePipeline: number; totalWeighted: number }
    > = {
      next30: { ar: 0, soldPipeline: 0, estimatePipeline: 0, totalWeighted: 0 },
      next60: { ar: 0, soldPipeline: 0, estimatePipeline: 0, totalWeighted: 0 },
      next90: { ar: 0, soldPipeline: 0, estimatePipeline: 0, totalWeighted: 0 },
      later: { ar: 0, soldPipeline: 0, estimatePipeline: 0, totalWeighted: 0 },
    };

    for (const row of openCashRows) {
      const amount = toNumber(row.value);
      const dueEpoch = row.invoice_due ? parseInt(row.invoice_due, 10) : 0;
      const invoiceEpoch = row.last_invoice_date ? parseInt(row.last_invoice_date, 10) : 0;
      const fallbackDays = timingMap[row.record_type_name]?.invoiceToPaidDays ?? DEFAULT_DAYS_TO_PAID[row.record_type_name];
      const projected = dueEpoch > 0
        ? new Date(dueEpoch * 1000)
        : invoiceEpoch > 0
          ? new Date((invoiceEpoch + fallbackDays * 86400) * 1000)
          : addDays(fallbackDays);
      const bucket = bucketForDate(projected);
      cashBuckets[bucket].ar += amount;
      cashBuckets[bucket].totalWeighted += amount;
    }

    for (const row of statusValue) {
      const recordType = row.recordType;
      const days = timingMap[recordType]?.soldToPaidDays ?? DEFAULT_DAYS_TO_PAID[recordType];
      const soldProbability = SOLD_OR_LATER.includes(row.status) ? 0.9 : 0;
      const estimateProbability = ESTIMATE_STATUSES.includes(row.status)
        ? (conversions.find((c) => c.recordType === recordType && c.from === "Estimate Sent" && c.to === "Sold Job")?.conversionRate ?? 20) / 100
        : 0;

      if (soldProbability > 0 && row.status !== "Paid & Closed") {
        const bucket = bucketForDate(addDays(days));
        const weighted = row.value * soldProbability;
        cashBuckets[bucket].soldPipeline += row.value;
        cashBuckets[bucket].totalWeighted += weighted;
      } else if (estimateProbability > 0) {
        const bucket = bucketForDate(addDays(days + 7));
        const weighted = row.value * estimateProbability;
        cashBuckets[bucket].estimatePipeline += row.value;
        cashBuckets[bucket].totalWeighted += weighted;
      }
    }

    const stuckJobs = stuckRows
      .map((row) => {
        const ageDays = toNumber(row.age_days);
        const thresholdDays = thresholdFor(row.record_type_name, row.status_name);
        return {
          recordType: row.record_type_name,
          status: row.status_name,
          jobJnid: row.job_jnid,
          jobNumber: row.job_number,
          jobName: row.job_name,
          salesRepName: row.sales_rep_name ?? "Unassigned",
          value: Math.round(toNumber(row.value)),
          enteredAt: row.entered_at,
          ageDays,
          thresholdDays,
          daysOver: round1(ageDays - thresholdDays),
          jobUrl: jobUrl(row.job_jnid),
        };
      })
      .filter((row) => row.daysOver > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 25);

    const totalActivePipeline = statusValue.reduce((sum, row) => sum + row.value, 0);
    const totalStuckValue = stuckJobs.reduce((sum, row) => sum + row.value, 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      sourceWindow: {
        jobStageHistoryStarts: "2026-01-21",
        cohortStarts: "2026-01-01",
        caveat: "Status-by-status timing is reliable from late January 2026 forward. Pre-2026 timing needs activity-log backfill.",
      },
      summary: {
        totalActivePipeline: Math.round(totalActivePipeline),
        totalStuckValue: Math.round(totalStuckValue),
        expectedWeightedCash90: Math.round(
          cashBuckets.next30.totalWeighted + cashBuckets.next60.totalWeighted + cashBuckets.next90.totalWeighted
        ),
        activeJobCount: statusValue.reduce((sum, row) => sum + row.jobs, 0),
      },
      cashBuckets: Object.entries(cashBuckets).map(([bucket, value]) => ({
        bucket,
        ar: Math.round(value.ar),
        soldPipeline: Math.round(value.soldPipeline),
        estimatePipeline: Math.round(value.estimatePipeline),
        totalWeighted: Math.round(value.totalWeighted),
      })),
      timingByRecordType,
      statusValue,
      transitions,
      conversions,
      stuckJobs,
      notes: [
        "Read-only V1: no JobNimbus writes or CRM mutations.",
        "Retail and Insurance use separate timing curves because cash timing is materially different.",
        "Early estimate pipeline stays separate from AR/sold cash so the forecast does not turn hope into payroll math.",
        "Pipeline dollars by status currently use the highest JobNimbus job-level rollup available: approved estimate, approved invoice, latest estimate, or latest invoice.",
        "Multiple/voided estimate handling depends on the JobNimbus → Supabase rollup staying current; row-level estimate selection is the next accuracy upgrade.",
        "Show sample size next to every timing metric before treating it as a rule.",
      ],
    });
  } catch (error) {
    console.error("[Pipeline Cashflow API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pipeline cashflow" },
      { status: 500 }
    );
  }
}
