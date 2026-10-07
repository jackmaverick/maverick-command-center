import {
  addDays,
  addMonths,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const METRICS_TIME_ZONE = "America/Chicago";
export const METRIC_RULES_APPROVED_AT = "2026-10-07T08:08:00-05:00";

export const CLEAN_LEAD_DEFINITION =
  "Countable lead = metrics.v_jobs_clean where excluded_sales = false and storm_alert_prospect = false";

export function isCountableLead(alias = "j"): string {
  return `${alias}.excluded_sales = false
    AND ${alias}.storm_alert_prospect = false`;
}

export const APPOINTMENT_SET_BROAD_DEFINITION =
  "Appointment set (broad) = reached a Scheduled status or any later workflow status, or has an appointment task";

export const APPOINTMENT_SET_STRICT_DEFINITION =
  "Booked through Scheduled status (strict) = status trail includes Appointment Scheduled, Appt Scheduled, Storm Inspection Scheduled, or Adjuster Appt Scheduled";

export const INSURANCE_SOLD_DEFINITION =
  "Insurance sold = reached Deductible Collected or a later sold/production/AR/completed workflow status; Fully Approved and Deductible Invoice Sent are not sold";

const APPOINTMENT_SCHEDULED_STATUSES = [
  "Appointment Scheduled",
  "Appt Scheduled",
  "Storm Inspection Scheduled",
  "Adjuster Appt Scheduled",
] as const;

function sqlList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

export function appointmentSetStrictAtSql(alias = "j"): string {
  const stages = sqlList(APPOINTMENT_SCHEDULED_STATUSES);
  return `(
    SELECT MIN(strict_history.changed_at)
    FROM job_stage_history strict_history
    WHERE strict_history.job_jnid = ${alias}.jnid
      AND strict_history.to_stage_name IN (${stages})
  )`;
}

export function isAppointmentSetStrict(alias = "j"): string {
  return `${appointmentSetStrictAtSql(alias)} IS NOT NULL`;
}

export function appointmentSetBroadAtSql(alias = "j"): string {
  const stages = sqlList(APPOINTMENT_SCHEDULED_STATUSES);
  return `(
    SELECT MIN(broad_evidence.observed_at)
    FROM (
      SELECT broad_history.changed_at AS observed_at
      FROM job_stage_history broad_history
      JOIN workflow_stages reached_stage
        ON reached_stage.workflow_id = ${alias}.workflow_id
       AND reached_stage.name = broad_history.to_stage_name
      WHERE broad_history.job_jnid = ${alias}.jnid
        AND reached_stage.stage_order >= (
          SELECT MIN(scheduled_stage.stage_order)
          FROM workflow_stages scheduled_stage
          WHERE scheduled_stage.workflow_id = ${alias}.workflow_id
            AND scheduled_stage.name IN (${stages})
        )

      UNION ALL

      SELECT to_timestamp(${alias}.jn_date_status_change)
      FROM workflow_stages current_stage
      WHERE current_stage.workflow_id = ${alias}.workflow_id
        AND current_stage.name = ${alias}.status_name
        AND current_stage.stage_order >= (
          SELECT MIN(scheduled_stage.stage_order)
          FROM workflow_stages scheduled_stage
          WHERE scheduled_stage.workflow_id = ${alias}.workflow_id
            AND scheduled_stage.name IN (${stages})
        )

      UNION ALL

      SELECT COALESCE(
        appointment_task.start_date,
        to_timestamp(appointment_task.jn_date_created)
      )
      FROM tasks appointment_task
      WHERE appointment_task.job_jnid = ${alias}.jnid
        AND appointment_task.deleted_at IS NULL
        AND appointment_task.task_type ILIKE '%appointment%'
    ) broad_evidence
  )`;
}

export function isAppointmentSetBroad(alias = "j"): string {
  return `${appointmentSetBroadAtSql(alias)} IS NOT NULL`;
}

export function insuranceSoldAtSql(alias = "j"): string {
  return `(
    SELECT MIN(sold_evidence.observed_at)
    FROM (
      SELECT insurance_history.changed_at AS observed_at
      FROM job_stage_history insurance_history
      JOIN workflow_stages reached_stage
        ON reached_stage.workflow_id = ${alias}.workflow_id
       AND reached_stage.name = insurance_history.to_stage_name
      WHERE insurance_history.job_jnid = ${alias}.jnid
        AND reached_stage.stage_order >= (
          SELECT deductible_stage.stage_order
          FROM workflow_stages deductible_stage
          WHERE deductible_stage.workflow_id = ${alias}.workflow_id
            AND deductible_stage.name = 'Deductible Collected'
          LIMIT 1
        )
        AND reached_stage.jn_stage IN (
          'Sold', 'In Production', 'Accounts Receivable', 'Completed'
        )

      UNION ALL

      SELECT to_timestamp(${alias}.jn_date_status_change)
      FROM workflow_stages current_stage
      WHERE current_stage.workflow_id = ${alias}.workflow_id
        AND current_stage.name = ${alias}.status_name
        AND current_stage.stage_order >= (
          SELECT deductible_stage.stage_order
          FROM workflow_stages deductible_stage
          WHERE deductible_stage.workflow_id = ${alias}.workflow_id
            AND deductible_stage.name = 'Deductible Collected'
          LIMIT 1
        )
        AND current_stage.jn_stage IN (
          'Sold', 'In Production', 'Accounts Receivable', 'Completed'
        )
    ) sold_evidence
  )`;
}

export function isInsuranceSold(alias = "j"): string {
  return `${alias}.record_type_name = 'Insurance'
    AND ${insuranceSoldAtSql(alias)} IS NOT NULL`;
}

export const AUTO_OPENER_DEFINITION =
  "Automatic website-lead and Roofle webhook opener texts are excluded";

/**
 * Identifies opener texts from their originating webhook records. Exact
 * OpenPhone IDs are preferred; timestamp/job/phone matching covers older rows
 * whose webhook SMS ID was not mirrored.
 */
export function automaticOpenerSql(smsAlias = "s"): string {
  return `(
    EXISTS (
      SELECT 1
      FROM website_leads website_opener
      WHERE website_opener.sms_sent = true
        AND (
          website_opener.sms_message_id = ${smsAlias}.openphone_message_id
          OR (
            ${smsAlias}.sent_at BETWEEN website_opener.sms_sent_at - interval '2 minutes'
                                  AND website_opener.sms_sent_at + interval '5 minutes'
            AND (
              ${smsAlias}.job_jnid = website_opener.jobnimbus_job_id
              OR right(regexp_replace(${smsAlias}.to_numbers::text, '\\D', '', 'g'), 10)
                 LIKE '%' || right(regexp_replace(website_opener.phone, '\\D', '', 'g'), 10) || '%'
            )
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM roofle_events roofle_opener
      WHERE ${smsAlias}.sent_at BETWEEN roofle_opener.created_at - interval '2 minutes'
                                  AND roofle_opener.created_at + interval '10 minutes'
        AND (
          ${smsAlias}.job_jnid = roofle_opener.jobnimbus_job_id
          OR right(regexp_replace(${smsAlias}.to_numbers::text, '\\D', '', 'g'), 10)
             LIKE '%' || right(regexp_replace(roofle_opener.phone, '\\D', '', 'g'), 10) || '%'
        )
    )
  )`;
}

export type MetricsPeriod =
  | "six_months"
  | "week"
  | "last_week"
  | "month"
  | "last_month"
  | "quarter"
  | "ytd"
  | `month:${string}`
  | `week:${string}`;

export interface MetricsDateRange {
  key: MetricsPeriod;
  label: string;
  start: Date;
  end: Date;
}

export function isMetricsPeriod(value: string): value is MetricsPeriod {
  if (
    [
      "six_months",
      "week",
      "last_week",
      "month",
      "last_month",
      "quarter",
      "ytd",
    ].includes(value)
  ) {
    return true;
  }
  if (value.startsWith("month:")) {
    const month = value.slice(6);
    if (!/^\d{4}-\d{2}$/.test(month)) return false;
    const parsed = parseISO(`${month}-01`);
    return isValid(parsed) && format(parsed, "yyyy-MM") === month;
  }
  if (value.startsWith("week:")) {
    const day = value.slice(5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const parsed = parseISO(day);
    return isValid(parsed) && format(parsed, "yyyy-MM-dd") === day;
  }
  return false;
}

function chicagoBoundary(localDate: Date): Date {
  return fromZonedTime(localDate, METRICS_TIME_ZONE);
}

export function getMetricsDateRange(
  period: MetricsPeriod,
  now = new Date()
): MetricsDateRange {
  const localNow = toZonedTime(now, METRICS_TIME_ZONE);
  let startLocal = localNow;
  let end = now;
  let label = "Last 6 Months";

  if (period.startsWith("month:")) {
    startLocal = startOfMonth(parseISO(`${period.slice(6)}-01`));
    const nextMonth = addMonths(startLocal, 1);
    end = nextMonth <= localNow ? chicagoBoundary(nextMonth) : now;
    label = startLocal.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } else if (period.startsWith("week:")) {
    startLocal = startOfWeek(parseISO(period.slice(5)), { weekStartsOn: 1 });
    const nextWeek = addDays(startLocal, 7);
    end = nextWeek <= localNow ? chicagoBoundary(nextWeek) : now;
    label = `Week of ${startLocal.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })}`;
  } else {
    switch (period) {
      case "six_months":
        startLocal = startOfDay(subMonths(localNow, 6));
        label = "Last 6 Months";
        break;
      case "week":
        startLocal = startOfWeek(localNow, { weekStartsOn: 1 });
        label = "This Week";
        break;
      case "last_week":
        startLocal = startOfWeek(subWeeks(localNow, 1), { weekStartsOn: 1 });
        end = chicagoBoundary(addDays(startLocal, 7));
        label = "Last Week";
        break;
      case "month":
        startLocal = startOfMonth(localNow);
        label = "This Month";
        break;
      case "last_month":
        startLocal = startOfMonth(subMonths(localNow, 1));
        end = chicagoBoundary(addMonths(startLocal, 1));
        label = "Last Month";
        break;
      case "quarter":
        startLocal = startOfQuarter(localNow);
        label = "This Quarter";
        break;
      case "ytd":
        startLocal = startOfYear(localNow);
        label = "Year to Date";
        break;
    }
  }

  return {
    key: period,
    label,
    start: chicagoBoundary(startLocal),
    end,
  };
}
