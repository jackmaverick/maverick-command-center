import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import {
  APPOINTMENT_SET_BROAD_DEFINITION,
  APPOINTMENT_SET_STRICT_DEFINITION,
  AUTO_OPENER_DEFINITION,
  CLEAN_LEAD_DEFINITION,
  INSURANCE_SOLD_DEFINITION,
  METRIC_RULES_APPROVED_AT,
  METRICS_TIME_ZONE,
  automaticOpenerSql,
  appointmentSetBroadAtSql,
  appointmentSetStrictAtSql,
  getMetricsDateRange,
  insuranceSoldAtSql,
  isAppointmentSetBroad,
  isAppointmentSetStrict,
  isCountableLead,
  isInsuranceSold,
  isMetricsPeriod,
  type MetricsPeriod,
} from "@/lib/front-funnel-metrics";

export const dynamic = "force-dynamic";

const REAL_CONVERSATION_SECONDS = 30;
const BUSINESS_HOURS_DEFINITION =
  "Business hours = Monday–Friday, 8:00 AM–5:00 PM America/Chicago";

interface MetricsRow {
  persistence: Record<string, unknown>;
  contact: Record<string, unknown>;
  sources: Record<string, unknown>[];
  missed_calls: Record<string, unknown>[];
  appointment_to_estimate: Record<string, unknown>;
  coverage: Record<string, unknown>;
}

const SQL = `
WITH clean_jobs AS (
  SELECT
    j.jnid,
    j.id,
    j.primary_contact_jnid,
    j.workflow_id,
    j.status_name,
    j.jn_date_status_change,
    j.record_type_name,
    j.source_name,
    j.sales_rep_jnid,
    j.sales_rep_name,
    j.jn_date_created,
    ARRAY_REMOVE(ARRAY[
      right(regexp_replace(COALESCE(j.primary_contact_number, ''), '\\D', '', 'g'), 10),
      right(regexp_replace(COALESCE(j.parent_mobile_phone, ''), '\\D', '', 'g'), 10),
      right(regexp_replace(COALESCE(j.parent_home_phone, ''), '\\D', '', 'g'), 10),
      right(regexp_replace(COALESCE(j.parent_work_phone, ''), '\\D', '', 'g'), 10),
      right(regexp_replace(COALESCE(c.mobile_phone, ''), '\\D', '', 'g'), 10),
      right(regexp_replace(COALESCE(c.home_phone, ''), '\\D', '', 'g'), 10),
      right(regexp_replace(COALESCE(c.work_phone, ''), '\\D', '', 'g'), 10)
    ], '') AS phones
  FROM metrics.v_jobs_clean j
  LEFT JOIN contacts c ON c.jnid = j.primary_contact_jnid
  WHERE ${isCountableLead("j")}
),
cohort_base AS (
  SELECT
    j.*,
    to_timestamp(j.jn_date_created) AS lead_created_at,
    COALESCE(NULLIF(trim(j.source_name), ''), 'Unknown') AS source,
    ${appointmentSetBroadAtSql("j")} AS appointment_set_broad_at,
    ${appointmentSetStrictAtSql("j")} AS appointment_set_strict_at,
    ${insuranceSoldAtSql("j")} AS insurance_sold_at
  FROM clean_jobs j
  WHERE to_timestamp(j.jn_date_created) >= $1::timestamptz
    AND to_timestamp(j.jn_date_created) < $2::timestamptz
),
cohort AS (
  SELECT
    cohort_base.*,
    ${isAppointmentSetBroad("cohort_base")} AS appointment_set_broad,
    ${isAppointmentSetStrict("cohort_base")} AS appointment_set_strict,
    ${isInsuranceSold("cohort_base")} AS insurance_sold
  FROM cohort_base
),
call_communications AS (
  SELECT
    'call:' || c.openphone_call_id AS event_id,
    j.jnid AS job_jnid,
    c.started_at AS event_at,
    c.direction = 'outbound' AS is_attempt,
    (
      c.status = 'completed'
      AND COALESCE(c.duration_seconds, 0) >= ${REAL_CONVERSATION_SECONDS}
    ) AS is_conversation,
    (
      c.direction = 'outbound'
      OR (
        c.status = 'completed'
        AND COALESCE(c.duration_seconds, 0) >= ${REAL_CONVERSATION_SECONDS}
      )
    ) AS is_first_touch
  FROM calls c
  JOIN LATERAL (
    SELECT matched_lead.*
    FROM cohort matched_lead
    WHERE c.started_at >= matched_lead.lead_created_at
      AND c.started_at <= LEAST(
        $3::timestamptz,
        matched_lead.lead_created_at + interval '30 days'
      )
      AND (
        c.job_jnid = matched_lead.jnid
        OR c.contact_jnid = matched_lead.primary_contact_jnid
        OR right(
          regexp_replace(
            CASE WHEN c.direction = 'inbound' THEN c.from_number ELSE c.to_number END,
            '\\D', '', 'g'
          ),
          10
        ) = ANY(matched_lead.phones)
      )
    ORDER BY
      (c.job_jnid = matched_lead.jnid) DESC,
      (c.contact_jnid = matched_lead.primary_contact_jnid) DESC,
      matched_lead.lead_created_at DESC
    LIMIT 1
  ) j ON true
),
sms_communications AS (
  SELECT
    'sms:' || s.openphone_message_id AS event_id,
    j.jnid AS job_jnid,
    s.sent_at AS event_at,
    (s.direction = 'outgoing' AND NOT ${automaticOpenerSql("s")}) AS is_attempt,
    s.direction = 'incoming' AS is_conversation,
    (
      s.direction = 'incoming'
      OR (s.direction = 'outgoing' AND NOT ${automaticOpenerSql("s")})
    ) AS is_first_touch
  FROM sms_messages s
  JOIN LATERAL (
    SELECT matched_lead.*
    FROM cohort matched_lead
    WHERE s.sent_at >= matched_lead.lead_created_at
      AND s.sent_at <= LEAST(
        $3::timestamptz,
        matched_lead.lead_created_at + interval '30 days'
      )
      AND (
        s.job_jnid = matched_lead.jnid
        OR s.contact_jnid = matched_lead.primary_contact_jnid
        OR right(
          regexp_replace(
            CASE
              WHEN s.direction = 'incoming' THEN s.from_number
              ELSE s.to_numbers::text
            END,
            '\\D', '', 'g'
          ),
          10
        ) = ANY(matched_lead.phones)
      )
    ORDER BY
      (s.job_jnid = matched_lead.jnid) DESC,
      (s.contact_jnid = matched_lead.primary_contact_jnid) DESC,
      matched_lead.lead_created_at DESC
    LIMIT 1
  ) j ON true
),
communications AS (
  SELECT * FROM call_communications
  UNION ALL
  SELECT * FROM sms_communications
),
communication_windows AS (
  SELECT
    communications.*,
    MIN(event_at) FILTER (WHERE is_conversation)
      OVER (PARTITION BY job_jnid) AS first_conversation_at
  FROM communications
),
communication_summary AS (
  SELECT
    job_jnid,
    MIN(event_at) FILTER (WHERE is_first_touch) AS first_touch_at,
    MIN(first_conversation_at) AS first_conversation_at,
    COUNT(DISTINCT event_id) FILTER (
      WHERE is_attempt
        AND (first_conversation_at IS NULL OR event_at < first_conversation_at)
    )::int AS attempts_before_contact
  FROM communication_windows
  GROUP BY job_jnid
),
lead_metrics AS (
  SELECT
    j.*,
    s.first_touch_at,
    s.first_conversation_at,
    COALESCE(s.attempts_before_contact, 0) AS attempts_before_contact,
    j.lead_created_at <= $3::timestamptz - interval '7 days' AS eligible_7d,
    j.lead_created_at <= $3::timestamptz - interval '30 days' AS eligible_30d,
    s.first_conversation_at <= j.lead_created_at + interval '7 days' AS contacted_7d,
    s.first_conversation_at <= j.lead_created_at + interval '30 days' AS contacted_30d
  FROM cohort j
  LEFT JOIN communication_summary s ON s.job_jnid = j.jnid
),
persistence AS (
  SELECT jsonb_build_object(
    'neverReachedN', COUNT(*)::int,
    'averageAttempts', ROUND(AVG(attempts_before_contact)::numeric, 1),
    'buckets', jsonb_build_array(
      jsonb_build_object(
        'label', '0', 'count', COUNT(*) FILTER (WHERE attempts_before_contact = 0)::int,
        'percent', ROUND(100.0 * COUNT(*) FILTER (WHERE attempts_before_contact = 0) / NULLIF(COUNT(*), 0), 1),
        'sampleSize', COUNT(*)::int
      ),
      jsonb_build_object(
        'label', '1', 'count', COUNT(*) FILTER (WHERE attempts_before_contact = 1)::int,
        'percent', ROUND(100.0 * COUNT(*) FILTER (WHERE attempts_before_contact = 1) / NULLIF(COUNT(*), 0), 1),
        'sampleSize', COUNT(*)::int
      ),
      jsonb_build_object(
        'label', '2', 'count', COUNT(*) FILTER (WHERE attempts_before_contact = 2)::int,
        'percent', ROUND(100.0 * COUNT(*) FILTER (WHERE attempts_before_contact = 2) / NULLIF(COUNT(*), 0), 1),
        'sampleSize', COUNT(*)::int
      ),
      jsonb_build_object(
        'label', '3+', 'count', COUNT(*) FILTER (WHERE attempts_before_contact >= 3)::int,
        'percent', ROUND(100.0 * COUNT(*) FILTER (WHERE attempts_before_contact >= 3) / NULLIF(COUNT(*), 0), 1),
        'sampleSize', COUNT(*)::int
      )
    )
  ) AS data
  FROM lead_metrics
  WHERE eligible_30d AND NOT COALESCE(contacted_30d, false)
),
contact_summary AS (
  SELECT jsonb_build_object(
    'within7Days', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE eligible_7d AND contacted_7d)::int,
      'sampleSize', COUNT(*) FILTER (WHERE eligible_7d)::int,
      'percent', ROUND(
        100.0 * COUNT(*) FILTER (WHERE eligible_7d AND contacted_7d)
        / NULLIF(COUNT(*) FILTER (WHERE eligible_7d), 0), 1
      )
    ),
    'within30Days', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE eligible_30d AND contacted_30d)::int,
      'sampleSize', COUNT(*) FILTER (WHERE eligible_30d)::int,
      'percent', ROUND(
        100.0 * COUNT(*) FILTER (WHERE eligible_30d AND contacted_30d)
        / NULLIF(COUNT(*) FILTER (WHERE eligible_30d), 0), 1
      )
    ),
    'medianFirstConversationMinutes', ROUND((
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (first_conversation_at - lead_created_at)) / 60.0
      ) FILTER (WHERE contacted_30d)
    )::numeric, 1),
    'conversationSampleSize', COUNT(*) FILTER (WHERE contacted_30d)::int
  ) AS data
  FROM lead_metrics
),
source_metrics AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'source', source,
      'totalLeads', total_leads,
      'medianFirstTouchMinutes', median_first_touch_minutes,
      'touchSampleSize', touched_n,
      'neverTouchedCount', never_touched_n,
      'neverTouchedPercent', ROUND(100.0 * never_touched_n / NULLIF(total_leads, 0), 1),
      'contactedCount', contacted_n,
      'contactSampleSize', contact_eligible_n,
      'contactRate', ROUND(100.0 * contacted_n / NULLIF(contact_eligible_n, 0), 1),
      'appointmentSetBroadCount', appointment_set_broad_n,
      'appointmentSetBroadSampleSize', total_leads,
      'appointmentSetBroadPercent', ROUND(
        100.0 * appointment_set_broad_n / NULLIF(total_leads, 0), 1
      ),
      'appointmentSetStrictCount', appointment_set_strict_n,
      'appointmentSetStrictSampleSize', total_leads,
      'appointmentSetStrictPercent', ROUND(
        100.0 * appointment_set_strict_n / NULLIF(total_leads, 0), 1
      )
    )
    ORDER BY total_leads DESC, source
  ) AS data
  FROM (
    SELECT
      source,
      COUNT(*)::int AS total_leads,
      ROUND((
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (first_touch_at - lead_created_at)) / 60.0
        ) FILTER (WHERE first_touch_at IS NOT NULL)
      )::numeric, 1) AS median_first_touch_minutes,
      COUNT(*) FILTER (WHERE first_touch_at IS NOT NULL)::int AS touched_n,
      COUNT(*) FILTER (WHERE first_touch_at IS NULL)::int AS never_touched_n,
      COUNT(*) FILTER (WHERE eligible_30d)::int AS contact_eligible_n,
      COUNT(*) FILTER (WHERE eligible_30d AND contacted_30d)::int AS contacted_n,
      COUNT(*) FILTER (
        WHERE appointment_set_broad
      )::int AS appointment_set_broad_n,
      COUNT(*) FILTER (
        WHERE appointment_set_strict
      )::int AS appointment_set_strict_n
    FROM lead_metrics
    GROUP BY source
  ) by_source
),
missed_calls_matched AS (
  SELECT
    c.openphone_call_id,
    c.started_at AS missed_at,
    c.phone_number_id,
    j.jnid AS job_jnid,
    right(regexp_replace(c.from_number, '\\D', '', 'g'), 10) AS caller_phone
  FROM calls c
  JOIN LATERAL (
    SELECT clean_jobs.jnid
    FROM clean_jobs
    WHERE c.started_at >= to_timestamp(clean_jobs.jn_date_created)
      AND (
        c.job_jnid = clean_jobs.jnid
        OR c.contact_jnid = clean_jobs.primary_contact_jnid
        OR right(regexp_replace(c.from_number, '\\D', '', 'g'), 10) = ANY(clean_jobs.phones)
      )
    ORDER BY
      (c.job_jnid = clean_jobs.jnid) DESC,
      (c.contact_jnid = clean_jobs.primary_contact_jnid) DESC
    LIMIT 1
  ) j ON true
  WHERE c.direction = 'inbound'
    AND c.status = 'no-answer'
    AND c.started_at >= $1::timestamptz
    AND c.started_at < $2::timestamptz
),
missed_with_callback AS (
  SELECT
    missed.*,
    callback.started_at AS callback_at
  FROM missed_calls_matched missed
  LEFT JOIN LATERAL (
    SELECT c.started_at
    FROM calls c
    WHERE c.direction = 'outbound'
      AND c.started_at > missed.missed_at
      AND c.started_at <= $3::timestamptz
      AND (
        c.job_jnid = missed.job_jnid
        OR right(regexp_replace(c.to_number, '\\D', '', 'g'), 10) = missed.caller_phone
      )
    ORDER BY c.started_at
    LIMIT 1
  ) callback ON true
),
missed_call_metrics AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'line', line,
      'missedCount', missed_n,
      'inboundCount', inbound_n,
      'missedPercent', ROUND(100.0 * missed_n / NULLIF(inbound_n, 0), 1),
      'missedSampleSize', inbound_n,
      'medianCallbackMinutes', median_callback_minutes,
      'callbackSampleSize', callback_n,
      'neverCalledBackCount', missed_n - callback_n,
      'neverCalledBackPercent', ROUND(100.0 * (missed_n - callback_n) / NULLIF(missed_n, 0), 1),
      'neverCalledBackSampleSize', missed_n
    )
    ORDER BY missed_n DESC, line
  ) AS data
  FROM (
    SELECT
      COALESCE(NULLIF(p.name, ''), 'Unknown line') AS line,
      COUNT(*)::int AS missed_n,
      (
        SELECT COUNT(*)::int
        FROM calls inbound
        JOIN LATERAL (
          SELECT 1
          FROM clean_jobs
          WHERE inbound.started_at >= to_timestamp(clean_jobs.jn_date_created)
            AND (
              inbound.job_jnid = clean_jobs.jnid
              OR inbound.contact_jnid = clean_jobs.primary_contact_jnid
              OR right(regexp_replace(inbound.from_number, '\\D', '', 'g'), 10) = ANY(clean_jobs.phones)
            )
          LIMIT 1
        ) clean_match ON true
        WHERE inbound.direction = 'inbound'
          AND inbound.phone_number_id = missed.phone_number_id
          AND inbound.started_at >= $1::timestamptz
          AND inbound.started_at < $2::timestamptz
      ) AS inbound_n,
      COUNT(*) FILTER (WHERE callback_at IS NOT NULL)::int AS callback_n,
      ROUND((
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (callback_at - missed_at)) / 60.0
        ) FILTER (WHERE callback_at IS NOT NULL)
      )::numeric, 1) AS median_callback_minutes
    FROM missed_with_callback missed
    LEFT JOIN openphone_phone_numbers p
      ON p.phone_number_id = missed.phone_number_id
    GROUP BY missed.phone_number_id, p.name
  ) by_line
),
appointment_events AS (
  SELECT
    j.jnid,
    j.record_type_name,
    j.appointment_set_broad_at,
    j.appointment_set_strict_at,
    j.insurance_sold_at,
    MIN(h.changed_at) FILTER (
      WHERE h.to_stage_name = 'Estimate Sent'
    ) AS estimate_sent_at
  FROM cohort j
  LEFT JOIN job_stage_history h ON h.job_jnid = j.jnid
  WHERE j.record_type_name IN ('Retail', 'Repairs', 'Insurance')
  GROUP BY
    j.jnid,
    j.record_type_name,
    j.appointment_set_broad_at,
    j.appointment_set_strict_at,
    j.insurance_sold_at
),
estimate_jobs AS (
  SELECT
    j.jnid,
    BOOL_OR(
      COALESCE(e.is_active, true)
      AND COALESCE(e.status_name, '') <> 'Void'
      AND COALESCE(e.total, 0) > 0
    ) AS built,
    BOOL_OR(
      COALESCE(e.is_active, true)
      AND (
        e.status_name IN ('Sent', 'Approved', 'Invoiced')
        OR e.date_sign_requested IS NOT NULL
        OR e.date_signed IS NOT NULL
        OR e.esigned = true
      )
    ) OR EXISTS (
      SELECT 1 FROM job_stage_history sent_history
      WHERE sent_history.job_jnid = j.jnid
        AND sent_history.to_stage_name = 'Estimate Sent'
    ) AS sent
  FROM cohort j
  JOIN estimates e ON e.job_jnid = j.jnid
  WHERE j.record_type_name IN ('Retail', 'Repairs')
  GROUP BY j.jnid
),
appointment_metrics AS (
  SELECT jsonb_build_object(
    'retailRepairs', (
      SELECT jsonb_build_object(
        'broad', jsonb_build_object(
          'appointments', COUNT(*) FILTER (
            WHERE appointment_set_broad_at IS NOT NULL
          )::int,
          'estimateSentCount', COUNT(*) FILTER (
            WHERE estimate_sent_at IS NOT NULL
              AND appointment_set_broad_at IS NOT NULL
              AND estimate_sent_at >= appointment_set_broad_at
          )::int,
          'estimateSentPercent', ROUND(
            100.0 * COUNT(*) FILTER (
              WHERE estimate_sent_at IS NOT NULL
                AND appointment_set_broad_at IS NOT NULL
                AND estimate_sent_at >= appointment_set_broad_at
            ) / NULLIF(
              COUNT(*) FILTER (
                WHERE appointment_set_broad_at IS NOT NULL
              ),
              0
            ),
            1
          ),
          'sampleSize', COUNT(*) FILTER (
            WHERE appointment_set_broad_at IS NOT NULL
          )::int,
          'medianDaysToEstimateSent', ROUND((
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (
                estimate_sent_at - appointment_set_broad_at
              )) / 86400.0
            ) FILTER (
              WHERE estimate_sent_at IS NOT NULL
                AND appointment_set_broad_at IS NOT NULL
                AND estimate_sent_at >= appointment_set_broad_at
            )
          )::numeric, 1),
          'timingSampleSize', COUNT(*) FILTER (
            WHERE estimate_sent_at IS NOT NULL
              AND appointment_set_broad_at IS NOT NULL
              AND estimate_sent_at >= appointment_set_broad_at
          )::int
        ),
        'strict', jsonb_build_object(
          'appointments', COUNT(*) FILTER (
            WHERE appointment_set_strict_at IS NOT NULL
          )::int,
          'estimateSentCount', COUNT(*) FILTER (
            WHERE estimate_sent_at IS NOT NULL
              AND appointment_set_strict_at IS NOT NULL
              AND estimate_sent_at >= appointment_set_strict_at
          )::int,
          'estimateSentPercent', ROUND(
            100.0 * COUNT(*) FILTER (
              WHERE estimate_sent_at IS NOT NULL
                AND appointment_set_strict_at IS NOT NULL
                AND estimate_sent_at >= appointment_set_strict_at
            ) / NULLIF(
              COUNT(*) FILTER (
                WHERE appointment_set_strict_at IS NOT NULL
              ),
              0
            ),
            1
          ),
          'sampleSize', COUNT(*) FILTER (
            WHERE appointment_set_strict_at IS NOT NULL
          )::int,
          'medianDaysToEstimateSent', ROUND((
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (
                estimate_sent_at - appointment_set_strict_at
              )) / 86400.0
            ) FILTER (
              WHERE estimate_sent_at IS NOT NULL
                AND appointment_set_strict_at IS NOT NULL
                AND estimate_sent_at >= appointment_set_strict_at
            )
          )::numeric, 1),
          'timingSampleSize', COUNT(*) FILTER (
            WHERE estimate_sent_at IS NOT NULL
              AND appointment_set_strict_at IS NOT NULL
              AND estimate_sent_at >= appointment_set_strict_at
          )::int
        )
      )
      FROM appointment_events
      WHERE record_type_name IN ('Retail', 'Repairs')
    ),
    'insurance', (
      SELECT jsonb_build_object(
        'appointmentSetBroadCount', COUNT(*) FILTER (
          WHERE appointment_set_broad_at IS NOT NULL
        )::int,
        'appointmentSetStrictCount', COUNT(*) FILTER (
          WHERE appointment_set_strict_at IS NOT NULL
        )::int,
        'estimateSentPercent', NULL,
        'insuranceSoldCount', COUNT(*) FILTER (
          WHERE insurance_sold_at IS NOT NULL
        )::int,
        'insuranceSoldPercent', ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE insurance_sold_at IS NOT NULL
          ) / NULLIF(
            COUNT(*) FILTER (
              WHERE appointment_set_broad_at IS NOT NULL
            ),
            0
          ),
          1
        ),
        'insuranceSoldSampleSize', COUNT(*) FILTER (
          WHERE appointment_set_broad_at IS NOT NULL
        )::int,
        'note', 'Estimate Sent: N/A for Insurance'
      )
      FROM appointment_events
      WHERE record_type_name = 'Insurance'
    ),
    'builtNeverSent', (
      SELECT jsonb_build_object(
        'builtCount', COUNT(*) FILTER (WHERE built)::int,
        'neverSentCount', COUNT(*) FILTER (WHERE built AND NOT sent)::int,
        'neverSentPercent', ROUND(
          100.0 * COUNT(*) FILTER (WHERE built AND NOT sent)
          / NULLIF(COUNT(*) FILTER (WHERE built), 0), 1
        ),
        'sampleSize', COUNT(*) FILTER (WHERE built)::int
      )
      FROM estimate_jobs
    )
  ) AS data
),
answerconnect_metrics AS (
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (
      WHERE EXTRACT(ISODOW FROM call_timestamp AT TIME ZONE '${METRICS_TIME_ZONE}') BETWEEN 1 AND 5
        AND (call_timestamp AT TIME ZONE '${METRICS_TIME_ZONE}')::time >= time '08:00'
        AND (call_timestamp AT TIME ZONE '${METRICS_TIME_ZONE}')::time < time '17:00'
    )::int AS business_hours
  FROM answerconnect_calls answerconnect
  JOIN cohort answerconnect_lead
    ON answerconnect_lead.jnid = answerconnect.jobnimbus_job_id
),
coverage_metrics AS (
  SELECT jsonb_build_object(
    'unassigned', jsonb_build_object(
      'count', COUNT(*) FILTER (
        WHERE NULLIF(trim(sales_rep_jnid), '') IS NULL
      )::int,
      'sampleSize', COUNT(*)::int,
      'percent', ROUND(
        100.0 * COUNT(*) FILTER (
          WHERE NULLIF(trim(sales_rep_jnid), '') IS NULL
        ) / NULLIF(COUNT(*), 0), 1
      )
    ),
    'answerConnect', (
      SELECT jsonb_build_object(
        'total', total,
        'businessHoursCount', business_hours,
        'businessHoursPercent', ROUND(100.0 * business_hours / NULLIF(total, 0), 1),
        'businessHoursSampleSize', total,
        'afterHoursCount', total - business_hours,
        'afterHoursPercent', ROUND(100.0 * (total - business_hours) / NULLIF(total, 0), 1),
        'afterHoursSampleSize', total
      )
      FROM answerconnect_metrics
    )
  ) AS data
  FROM cohort
)
SELECT
  (SELECT data FROM persistence) AS persistence,
  (SELECT data FROM contact_summary) AS contact,
  COALESCE((SELECT data FROM source_metrics), '[]'::jsonb) AS sources,
  COALESCE((SELECT data FROM missed_call_metrics), '[]'::jsonb) AS missed_calls,
  (SELECT data FROM appointment_metrics) AS appointment_to_estimate,
  (SELECT data FROM coverage_metrics) AS coverage
`;

export async function GET(request: NextRequest) {
  try {
    const requestedPeriod = new URL(request.url).searchParams.get("period") ?? "six_months";
    const period: MetricsPeriod = isMetricsPeriod(requestedPeriod)
      ? requestedPeriod
      : "six_months";
    const now = new Date();
    const range = getMetricsDateRange(period, now);

    const row = await queryOne<MetricsRow>(SQL, [
      range.start.toISOString(),
      range.end.toISOString(),
      now.toISOString(),
    ]);

    if (!row) {
      throw new Error("Front-funnel query returned no result");
    }

    return NextResponse.json({
      period: {
        key: range.key,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        timeZone: METRICS_TIME_ZONE,
      },
      definitions: {
        approvedAt: METRIC_RULES_APPROVED_AT,
        cleanLead: CLEAN_LEAD_DEFINITION,
        automaticOpeners: AUTO_OPENER_DEFINITION,
        conversation: `Real conversation = incoming text or completed call lasting at least ${REAL_CONVERSATION_SECONDS} seconds`,
        appointmentSetBroad: APPOINTMENT_SET_BROAD_DEFINITION,
        appointmentSetStrict: APPOINTMENT_SET_STRICT_DEFINITION,
        insuranceSold: INSURANCE_SOLD_DEFINITION,
        businessHours: BUSINESS_HOURS_DEFINITION,
      },
      persistence: row.persistence,
      contact: row.contact,
      sources: row.sources,
      missedCalls: row.missed_calls,
      appointmentToEstimate: row.appointment_to_estimate,
      coverage: row.coverage,
      caveats: {
        missedCalls:
          "Minimums only. The Supabase Quo copy undercounts missed calls: Quo showed 49 on Main for Sep 29–Oct 6, while Supabase contained 16.",
      },
    });
  } catch (error) {
    console.error(
      "[Front Funnel Metrics API] Query failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { error: "Failed to fetch front-funnel metrics" },
      { status: 500 }
    );
  }
}
