BEGIN;

DROP VIEW IF EXISTS metrics.v_sales_metrics_jobs;
DROP VIEW IF EXISTS metrics.v_days_to_paid;
DROP VIEW IF EXISTS metrics.v_stale_estimates;
DROP VIEW IF EXISTS metrics.v_stage_dates;

DELETE FROM metrics.status_funnel_stage
WHERE status_name IN (
  'New',
  'New Lead',
  'Lead',
  'Contacting',
  'Future Work',
  'Cold',
  'Cold Lead',
  'Dead',
  'Lost',
  'No Damage'
);

UPDATE metrics.status_funnel_stage
SET
  funnel_stage = 'appointment',
  stage_order = 122,
  counts_as_appt_broad = true,
  is_strict_scheduled = false,
  is_sold = false,
  is_insurance_sold = false
WHERE status_name = 'Claim Denied';

ALTER TABLE metrics.status_funnel_stage
  DROP CONSTRAINT IF EXISTS status_funnel_stage_funnel_stage_check;

ALTER TABLE metrics.status_funnel_stage
  ADD CONSTRAINT status_funnel_stage_funnel_stage_check
  CHECK (funnel_stage IN ('appointment', 'approved_claim', 'sold'));

COMMIT;
