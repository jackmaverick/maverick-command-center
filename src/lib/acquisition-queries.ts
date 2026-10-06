export const META_COST_SQL = `SELECT 'meta_ads_daily_insights' AS source, id::text, 'Meta Ads' AS channel,
  'media' AS kind, date_start::text AS date, spend::text AS amount, website_leads::text AS platform_leads,
  synced_at::text AS synced_at, campaign_id AS reference, 'USD' AS currency
  FROM meta_ads_daily_insights WHERE account_id=$1 AND report_level='campaign' AND breakdown='{}'::jsonb
  ORDER BY date_start,campaign_id`;
export const AGENCY_COST_SQL = `SELECT 'meta_ads_agency_cost_events' AS source, id::text, 'Meta Ads' AS channel,
  CASE WHEN cost_type='setup_fee' THEN 'setup_payment' ELSE 'agency_payment' END AS kind,
  paid_at::text AS date, amount::text AS amount, updated_at::text AS synced_at,
  service_start::text, service_end::text, source_reference AS reference, currency
  FROM meta_ads_agency_cost_events WHERE account_id=$1 AND status='paid' AND paid_at IS NOT NULL
  ORDER BY paid_at,id`;
export const MAIL_COST_SQL = `SELECT 'marketing_campaigns' AS source, id::text, channel,
  'mail' AS kind, send_date::text AS date, total_cost::text AS amount,
  updated_at::text AS synced_at, campaign_name AS reference, 'USD' AS currency
  FROM marketing_campaigns WHERE channel IN ('direct_mail','direct mail','Direct Mail')
  ORDER BY send_date,id`;
export const LSA_COST_SQL = `SELECT 'lsa_leads' AS source,id::text,'LSA' AS channel,'lead_charge' AS kind,
  (COALESCE(event_at,received_at,created_at) AT TIME ZONE 'America/Chicago')::date::text AS date,
  cost_usd::text AS amount, updated_at::text AS synced_at, cost_source AS reference,'USD' AS currency
  FROM lsa_leads ORDER BY COALESCE(event_at,received_at,created_at),id`;

export const CRM_COHORT_SQL = `WITH eligible AS (
 SELECT j.*, COALESCE(NULLIF(j.primary_contact_jnid,''),'missing:'||j.jnid) AS contact_key
 FROM jobs j WHERE j.deleted_at IS NULL
), historic AS (
 SELECT contact_key, MIN(jn_date_created) AS first_created FROM eligible GROUP BY contact_key
), cohort AS (
 SELECT e.*, COALESCE(NULLIF(trim(source_name),''),'Unknown') AS normalized_source,
   EXISTS(SELECT 1 FROM estimates est WHERE est.job_jnid=e.jnid AND est.is_active=true
      AND (est.status_name='Approved' OR est.esigned=true OR est.date_signed IS NOT NULL)) AS approved,
   EXISTS(SELECT 1 FROM estimates est WHERE est.job_jnid=e.jnid AND est.is_active=true
      AND est.date_signed >= to_timestamp(e.jn_date_created) AND est.date_signed < to_timestamp($2)) AS dated_signed
 FROM eligible e WHERE e.jn_date_created >= $1 AND e.jn_date_created < $2
), assigned AS (
 SELECT DISTINCT ON(contact_key) contact_key,normalized_source FROM cohort ORDER BY contact_key,jn_date_created,jnid
), grouped AS (
 SELECT a.normalized_source AS source, c.contact_key,
   COUNT(*) AS jobs, BOOL_OR(c.approved) AS approved_contact, COUNT(*) FILTER(WHERE c.approved) AS approved_jobs,
   COUNT(*) FILTER(WHERE c.dated_signed) AS dated_signed_jobs, BOOL_OR(c.dated_signed) AS dated_signed_contact,
   BOOL_OR(NULLIF(c.primary_contact_jnid,'') IS NULL) AS missing_contact,
   h.first_created < $1 AS existing_contact, MAX(c.last_synced_at) AS latest_sync,MIN(c.last_synced_at) AS oldest_sync
 FROM cohort c JOIN assigned a USING(contact_key) JOIN historic h USING(contact_key)
 GROUP BY a.normalized_source,c.contact_key,h.first_created
)
SELECT source, SUM(jobs)::text AS job_records, COUNT(*) FILTER(WHERE NOT missing_contact)::text AS contact_groups,
 COUNT(*) FILTER(WHERE existing_contact AND NOT missing_contact)::text AS existing_contacts,
 COALESCE(SUM(jobs) FILTER(WHERE missing_contact),0)::text AS missing_contact_jobs,
 SUM(approved_jobs)::text AS approved_job_records,
 COUNT(*) FILTER(WHERE approved_contact AND NOT missing_contact)::text AS approved_contact_groups,
 SUM(dated_signed_jobs)::text AS dated_signed_job_records,
 COUNT(*) FILTER(WHERE dated_signed_contact AND NOT missing_contact)::text AS dated_signed_contact_groups,
 MAX(latest_sync)::text AS latest_sync,MIN(oldest_sync)::text AS oldest_sync
FROM grouped GROUP BY source ORDER BY SUM(jobs) DESC`;

export const BUDGET_SQL = `SELECT amount::text,frequency FROM app_recurring_expenses
 WHERE category ILIKE 'Marketing' AND start_date < $2::date AND (end_date IS NULL OR end_date >= $1::date)`;
export const PLANNED_ONE_TIME_SQL = `SELECT SUM(amount)::text AS amount FROM app_one_time_expenses
 WHERE category ILIKE 'Marketing' AND expected_date >= $1::date AND expected_date < $2::date`;
