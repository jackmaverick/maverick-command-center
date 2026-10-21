BEGIN;

-- This migration extends metrics objects provisioned by the existing
-- Supabase metrics migration chain. Fail clearly if that prerequisite is
-- missing instead of partially applying against an unknown schema.
DO $$
BEGIN
  IF to_regclass('metrics.status_funnel_stage') IS NULL
    OR to_regclass('metrics.v_jobs_clean') IS NULL
    OR to_regclass('metrics.v_invoices_clean') IS NULL
    OR to_regclass('metrics.v_sales_funnel_jobs') IS NULL
  THEN
    RAISE EXCEPTION 'Required metrics baseline objects are missing';
  END IF;
END $$;

ALTER TABLE metrics.status_funnel_stage
  DROP CONSTRAINT status_funnel_stage_funnel_stage_check;

ALTER TABLE metrics.status_funnel_stage
  ADD CONSTRAINT status_funnel_stage_funnel_stage_check
  CHECK (funnel_stage IN ('lead', 'appointment', 'approved_claim', 'sold', 'closed_lost'));

INSERT INTO metrics.status_funnel_stage (
  status_name,
  funnel_stage,
  stage_order,
  counts_as_appt_broad,
  is_strict_scheduled,
  is_sold,
  is_insurance_sold
)
VALUES
  ('New', 'lead', 10, false, false, false, false),
  ('New Lead', 'lead', 11, false, false, false, false),
  ('Lead', 'lead', 12, false, false, false, false),
  ('Contacting', 'lead', 13, false, false, false, false),
  ('Future Work', 'lead', 14, false, false, false, false),
  ('Cold', 'closed_lost', 400, false, false, false, false),
  ('Cold Lead', 'closed_lost', 401, false, false, false, false),
  ('Dead', 'closed_lost', 402, false, false, false, false),
  ('Lost', 'closed_lost', 403, false, false, false, false),
  ('No Damage', 'closed_lost', 404, false, false, false, false);

UPDATE metrics.status_funnel_stage
SET
  funnel_stage = 'closed_lost',
  stage_order = 405,
  counts_as_appt_broad = true,
  is_strict_scheduled = false,
  is_sold = false,
  is_insurance_sold = false
WHERE status_name = 'Claim Denied';

CREATE VIEW metrics.v_stage_dates
WITH (security_invoker = true)
AS
WITH status_events AS (
  SELECT
    history.job_jnid::text AS job_jnid,
    history.to_stage_name::text AS status_name,
    history.changed_at AS entered_at
  FROM public.job_stage_history history
  WHERE history.job_jnid IS NOT NULL
    AND history.to_stage_name IS NOT NULL

  UNION ALL

  SELECT
    timeline.job_jnid::text AS job_jnid,
    btrim(substring(timeline.title FROM 'Moved from .* to (.*)$')) AS status_name,
    timeline.event_time AS entered_at
  FROM public.job_timeline timeline
  WHERE timeline.job_jnid IS NOT NULL
    AND timeline.event_type = 'stage_change'
    AND timeline.title LIKE 'Moved from % to %'

  UNION ALL

  SELECT
    timeline.job_jnid::text AS job_jnid,
    btrim(substring(timeline.details FROM 'Status: [^\n]* => ([^\n]*)')) AS status_name,
    timeline.event_time AS entered_at
  FROM public.job_timeline timeline
  WHERE timeline.job_jnid IS NOT NULL
    AND timeline.event_type IN ('status_change', 'status_changed')
    AND timeline.details LIKE '%Status:%=>%'
),
deduplicated_events AS (
  SELECT DISTINCT job_jnid, status_name, entered_at
  FROM status_events
  WHERE NULLIF(status_name, '') IS NOT NULL
),
job_events AS (
  SELECT
    job.jnid::text AS job_jnid,
    job.record_type_name::text AS record_type_name,
    event.status_name,
    event.entered_at,
    mapping.funnel_stage,
    mapping.is_sold,
    mapping.is_insurance_sold,
    COALESCE(
      to_timestamp(NULLIF(job.jn_date_status_change, 0)),
      to_timestamp(job.jn_date_created)
    ) AS current_status_changed_at,
    CASE
      WHEN job.record_type_name = 'Insurance'
        THEN COALESCE(current_mapping.is_insurance_sold, false)
      ELSE COALESCE(current_mapping.is_sold, false)
    END AS current_status_is_sold
  FROM metrics.v_jobs_clean job
  LEFT JOIN deduplicated_events event ON event.job_jnid = job.jnid::text
  LEFT JOIN metrics.status_funnel_stage mapping ON mapping.status_name = event.status_name
  LEFT JOIN metrics.status_funnel_stage current_mapping
    ON current_mapping.status_name = job.status_name
  WHERE NOT job.excluded_sales
    AND NOT COALESCE(job.storm_alert_prospect, false)
)
SELECT
  job_id AS job_jnid,
  max(record_type_name) AS record_type_name,
  min(entered_at) FILTER (WHERE funnel_stage = 'lead') AS lead_at,
  min(entered_at) FILTER (WHERE funnel_stage = 'appointment') AS appointment_at,
  min(entered_at) FILTER (WHERE status_name = 'Estimate Sent') AS estimate_sent_at,
  COALESCE(
    min(entered_at) FILTER (
      WHERE CASE
        WHEN record_type_name = 'Insurance' THEN is_insurance_sold
        ELSE is_sold
      END
    ),
    max(current_status_changed_at) FILTER (WHERE current_status_is_sold)
  ) AS sold_at,
  min(entered_at) FILTER (WHERE funnel_stage = 'closed_lost') AS closed_lost_at
FROM (
  SELECT job_jnid AS job_id, *
  FROM job_events
) events
GROUP BY job_id;

CREATE VIEW metrics.v_stale_estimates
WITH (security_invoker = true)
AS
WITH latest_estimate AS (
  SELECT DISTINCT ON (estimate.job_jnid)
    estimate.job_jnid,
    estimate.jnid AS estimate_jnid,
    estimate.total,
    estimate.date_estimate,
    estimate.sales_rep_jnid,
    estimate.sales_rep_name
  FROM public.estimates estimate
  WHERE COALESCE(estimate.is_active, true)
    AND NOT COALESCE(estimate.is_archived, false)
    AND COALESCE(estimate.status_name, '') <> 'Void'
  ORDER BY
    estimate.job_jnid,
    estimate.date_estimate DESC NULLS LAST,
    estimate.jn_date_updated DESC NULLS LAST
)
SELECT
  job.jnid::text AS job_jnid,
  job.number AS job_number,
  job.name AS job_name,
  COALESCE(
    job.sales_rep_jnid,
    latest_estimate.sales_rep_jnid,
    job.created_by_jnid
  ) AS sales_rep_jnid,
  COALESCE(
    NULLIF(btrim(job.sales_rep_name), ''),
    NULLIF(btrim(latest_estimate.sales_rep_name), ''),
    NULLIF(btrim(job.created_by_name), ''),
    'Unassigned'
  ) AS sales_rep_name,
  CASE
    WHEN NULLIF(btrim(job.sales_rep_name), '') IS NOT NULL THEN 'sales_rep'
    WHEN NULLIF(btrim(latest_estimate.sales_rep_name), '') IS NOT NULL THEN 'estimate_rep'
    WHEN NULLIF(btrim(job.created_by_name), '') IS NOT NULL THEN 'job_owner'
    ELSE 'unassigned'
  END AS rep_source,
  job.record_type_name,
  COALESCE(
    to_timestamp(NULLIF(job.jn_date_status_change, 0)),
    to_timestamp(job.jn_date_created)
  ) AS status_changed_at,
  ((now() AT TIME ZONE 'America/Chicago')::date
    - (COALESCE(
        to_timestamp(NULLIF(job.jn_date_status_change, 0)),
        to_timestamp(job.jn_date_created)
      ) AT TIME ZONE 'America/Chicago')::date) AS age_days,
  ((now() AT TIME ZONE 'America/Chicago')::date
    - (COALESCE(
        to_timestamp(NULLIF(job.jn_date_status_change, 0)),
        to_timestamp(job.jn_date_created)
      ) AT TIME ZONE 'America/Chicago')::date) >= 14 AS stale_14,
  ((now() AT TIME ZONE 'America/Chicago')::date
    - (COALESCE(
        to_timestamp(NULLIF(job.jn_date_status_change, 0)),
        to_timestamp(job.jn_date_created)
      ) AT TIME ZONE 'America/Chicago')::date) >= 90 AS stale_90,
  COALESCE(
    NULLIF(job.approved_estimate_total, 0),
    job.last_estimate,
    0
  )::numeric AS estimate_value
FROM metrics.v_jobs_clean job
LEFT JOIN latest_estimate ON latest_estimate.job_jnid = job.jnid::text
WHERE job.status_name = 'Estimate Sent'
  AND NOT job.excluded_sales
  AND NOT COALESCE(job.storm_alert_prospect, false);

CREATE VIEW metrics.v_days_to_paid
WITH (security_invoker = true)
AS
WITH paid_jobs AS (
  SELECT
    invoice.job_jnid::text AS job_jnid,
    max(to_timestamp(invoice.date_paid_in_full)) AS paid_at
  FROM metrics.v_invoices_clean invoice
  WHERE COALESCE(invoice.status_name, '') <> 'Draft'
  GROUP BY invoice.job_jnid
  HAVING sum(
    GREATEST(
      COALESCE(invoice.due, invoice.total - COALESCE(invoice.total_paid, 0), 0),
      0
    )
  ) <= 0.01
    AND max(invoice.date_paid_in_full) IS NOT NULL
)
SELECT
  stage.record_type_name,
  date_trunc('month', stage.sold_at AT TIME ZONE 'America/Chicago')::date AS sold_month_ct,
  stage.sold_at,
  paid.paid_at,
  (
    (paid.paid_at AT TIME ZONE 'America/Chicago')::date
    - (stage.sold_at AT TIME ZONE 'America/Chicago')::date
  ) AS days_to_paid,
  stage.sold_at > now() - interval '90 days' AS provisional
FROM metrics.v_stage_dates stage
JOIN paid_jobs paid ON paid.job_jnid = stage.job_jnid
WHERE stage.record_type_name IN ('Insurance', 'Retail', 'Repairs')
  AND (stage.sold_at AT TIME ZONE 'America/Chicago')::date
    >= (now() AT TIME ZONE 'America/Chicago')::date - interval '12 months'
  AND paid.paid_at >= stage.sold_at;

CREATE VIEW metrics.v_billed_invoices
WITH (security_invoker = true)
AS
SELECT invoice.*
FROM metrics.v_invoices_clean invoice
WHERE COALESCE(invoice.status_name, '') IN ('Sent', 'Open', 'Closed');

CREATE VIEW metrics.v_sales_metrics_jobs
WITH (security_invoker = true)
AS
WITH latest_estimate AS (
  SELECT DISTINCT ON (estimate.job_jnid)
    estimate.job_jnid,
    estimate.sales_rep_jnid,
    estimate.sales_rep_name
  FROM public.estimates estimate
  WHERE COALESCE(estimate.is_active, true)
    AND NOT COALESCE(estimate.is_archived, false)
    AND COALESCE(estimate.status_name, '') <> 'Void'
  ORDER BY
    estimate.job_jnid,
    estimate.date_estimate DESC NULLS LAST,
    estimate.jn_date_updated DESC NULLS LAST
),
invoice_totals AS (
  SELECT
    invoice.job_jnid::text AS job_jnid,
    sum(COALESCE(invoice.total, 0))::numeric AS billed_revenue
  FROM metrics.v_billed_invoices invoice
  GROUP BY invoice.job_jnid
),
all_invoice_totals AS (
  SELECT
    invoice.job_jnid::text AS job_jnid,
    sum(COALESCE(invoice.total, 0))::numeric AS invoice_revenue
  FROM metrics.v_invoices_clean invoice
  GROUP BY invoice.job_jnid
)
SELECT
  funnel.job_id,
  funnel.jnid::text AS job_jnid,
  funnel.created_at,
  funnel.created_ct,
  funnel.record_type_name,
  COALESCE(
    job.sales_rep_jnid,
    latest_estimate.sales_rep_jnid,
    job.created_by_jnid
  ) AS sales_rep_jnid,
  COALESCE(
    NULLIF(btrim(job.sales_rep_name), ''),
    NULLIF(btrim(latest_estimate.sales_rep_name), ''),
    NULLIF(btrim(job.created_by_name), ''),
    'Unassigned'
  ) AS sales_rep_name,
  CASE
    WHEN NULLIF(btrim(job.sales_rep_name), '') IS NOT NULL THEN 'sales_rep'
    WHEN NULLIF(btrim(latest_estimate.sales_rep_name), '') IS NOT NULL THEN 'estimate_rep'
    WHEN NULLIF(btrim(job.created_by_name), '') IS NOT NULL THEN 'job_owner'
    ELSE 'unassigned'
  END AS rep_source,
  CASE
    WHEN COALESCE(
      NULLIF(btrim(job.sales_rep_name), ''),
      NULLIF(btrim(latest_estimate.sales_rep_name), ''),
      NULLIF(btrim(job.created_by_name), '')
    ) IS NULL THEN 'Unassigned'
    WHEN COALESCE(
      NULLIF(btrim(job.sales_rep_name), ''),
      NULLIF(btrim(latest_estimate.sales_rep_name), ''),
      NULLIF(btrim(job.created_by_name), '')
    ) = 'Michael Blake' THEN 'Michael'
    WHEN COALESCE(
      NULLIF(btrim(job.sales_rep_name), ''),
      NULLIF(btrim(latest_estimate.sales_rep_name), ''),
      NULLIF(btrim(job.created_by_name), '')
    ) = 'Bob Blake' THEN 'Bob'
    WHEN COALESCE(
      NULLIF(btrim(job.sales_rep_name), ''),
      NULLIF(btrim(latest_estimate.sales_rep_name), ''),
      NULLIF(btrim(job.created_by_name), '')
    ) = 'Jack Blake' THEN 'Jack'
    ELSE 'Other'
  END AS rep_bucket,
  funnel.sold,
  COALESCE(mapping.funnel_stage = 'closed_lost', false) AS closed_lost,
  stage.sold_at,
  COALESCE(
    NULLIF(job.approved_estimate_total, 0),
    job.last_estimate,
    0
  )::numeric AS sold_value,
  COALESCE(invoice_totals.billed_revenue, 0)::numeric AS billed_revenue,
  COALESCE(all_invoice_totals.invoice_revenue, 0)::numeric AS invoice_revenue,
  COALESCE(stale.stale_14, false) AS stale_estimate_14,
  COALESCE(stale.stale_90, false) AS stale_estimate_90,
  funnel.status_name IS NULL AS missing_status,
  funnel.sales_rep_name IS NULL OR btrim(funnel.sales_rep_name) = '' AS missing_rep
FROM metrics.v_sales_funnel_jobs funnel
JOIN metrics.v_jobs_clean job ON job.jnid::text = funnel.jnid::text
LEFT JOIN latest_estimate ON latest_estimate.job_jnid = funnel.jnid::text
LEFT JOIN metrics.status_funnel_stage mapping ON mapping.status_name = funnel.status_name
LEFT JOIN metrics.v_stage_dates stage ON stage.job_jnid = funnel.jnid::text
LEFT JOIN invoice_totals ON invoice_totals.job_jnid = funnel.jnid::text
LEFT JOIN all_invoice_totals ON all_invoice_totals.job_jnid = funnel.jnid::text
LEFT JOIN metrics.v_stale_estimates stale ON stale.job_jnid = funnel.jnid::text;

REVOKE ALL ON
  metrics.v_stage_dates,
  metrics.v_stale_estimates,
  metrics.v_days_to_paid,
  metrics.v_billed_invoices,
  metrics.v_sales_metrics_jobs
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON
  metrics.v_stage_dates,
  metrics.v_stale_estimates,
  metrics.v_days_to_paid,
  metrics.v_billed_invoices,
  metrics.v_sales_metrics_jobs
TO service_role;

COMMENT ON VIEW metrics.v_days_to_paid IS
  'CT sold cohorts from JobNimbus history/timeline to latest fully-paid clean invoice. Cohorts under 90 days are provisional.';
COMMENT ON VIEW metrics.v_sales_metrics_jobs IS
  'One clean row per sales-funnel job with canonical sold mapping, unassigned attribution, sold value, and clean billed revenue.';

COMMIT;
