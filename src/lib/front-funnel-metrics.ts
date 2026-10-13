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

export const SALES_FUNNEL_JOBS_VIEW = "metrics.v_sales_funnel_jobs";
export const STATUS_FUNNEL_STAGE_TABLE = "metrics.status_funnel_stage";

export const SALES_FUNNEL_COLUMNS = {
  createdDate: "created_ct",
  appointmentSetBroad: "appt_set_broad",
  appointmentSetStrict: "appt_set_strict",
  appointmentByStatus: "appt_by_status",
  appointmentByTask: "appt_by_task",
  sold: "sold",
  insuranceSold: "insurance_sold",
  approvedClaim: "approved_claim",
  repBucket: "rep_bucket",
} as const;

export const STATUS_FUNNEL_COLUMNS = {
  statusName: "status_name",
  countsAsAppointmentBroad: "counts_as_appt_broad",
  isStrictScheduled: "is_strict_scheduled",
  isSold: "is_sold",
  isInsuranceSold: "is_insurance_sold",
} as const;

export const ESTIMATE_SENT_STATUS = "Estimate Sent";
export const SALES_FUNNEL_REFERENCE_WINDOW = {
  startDate: "2026-04-06",
  endDateExclusive: "2026-10-07",
  label: "Apr 6 – Oct 6, 2026",
} as const;

export const CLEAN_LEAD_DEFINITION =
  "Countable lead = one row from metrics.v_sales_funnel_jobs, which already excludes excluded_sales and storm_alert_prospect jobs";

export function salesFunnelJobsSql(alias = "funnel_job"): string {
  return `${SALES_FUNNEL_JOBS_VIEW} ${alias}`;
}

export function statusFunnelStageSql(alias = "funnel_stage"): string {
  return `${STATUS_FUNNEL_STAGE_TABLE} ${alias}`;
}

export function funnelCreatedDateWhere(
  alias = "funnel_job",
  startParameter = "$4",
  endParameter = "$5"
): string {
  return `${alias}.${SALES_FUNNEL_COLUMNS.createdDate} >= ${startParameter}::date
    AND ${alias}.${SALES_FUNNEL_COLUMNS.createdDate} < ${endParameter}::date`;
}

export function isCountableLead(alias = "funnel_job"): string {
  return `${alias}.job_id IS NOT NULL`;
}

export const APPOINTMENT_SET_BROAD_DEFINITION =
  "Appointment set (broad) = reached a Scheduled status or any later workflow status, or has an appointment task";

export const APPOINTMENT_SET_STRICT_DEFINITION =
  "Booked through Scheduled status (strict) = status trail includes Appointment Scheduled, Appt Scheduled, Storm Inspection Scheduled, or Adjuster Appt Scheduled";

export const INSURANCE_SOLD_DEFINITION =
  "Insurance sold = metrics.v_sales_funnel_jobs.insurance_sold; migration 10 starts this at Deductible Collected or later, not Fully Approved or Deductible Invoice Sent";

export function isAppointmentSetStrict(alias = "funnel_job"): string {
  return `${alias}.${SALES_FUNNEL_COLUMNS.appointmentSetStrict} = true`;
}

export function isAppointmentSetBroad(alias = "funnel_job"): string {
  return `${alias}.${SALES_FUNNEL_COLUMNS.appointmentSetBroad} = true`;
}

export function isSold(alias = "funnel_job"): string {
  return `${alias}.${SALES_FUNNEL_COLUMNS.sold} = true`;
}

export function isInsuranceSold(alias = "funnel_job"): string {
  return `${alias}.${SALES_FUNNEL_COLUMNS.insuranceSold} = true`;
}

export function isUnassignedLead(alias = "funnel_job"): string {
  return `${alias}.${SALES_FUNNEL_COLUMNS.repBucket} = 'Unassigned'`;
}

export function countsAsAppointmentBroad(alias = "funnel_stage"): string {
  return `${alias}.${STATUS_FUNNEL_COLUMNS.countsAsAppointmentBroad} = true`;
}

export function isStrictScheduledStage(alias = "funnel_stage"): string {
  return `${alias}.${STATUS_FUNNEL_COLUMNS.isStrictScheduled} = true`;
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
  | "reference"
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
      "reference",
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
      case "reference":
        startLocal = parseISO(SALES_FUNNEL_REFERENCE_WINDOW.startDate);
        end = chicagoBoundary(
          parseISO(SALES_FUNNEL_REFERENCE_WINDOW.endDateExclusive)
        );
        label = SALES_FUNNEL_REFERENCE_WINDOW.label;
        break;
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

export function getMetricsCreatedDateBounds(range: MetricsDateRange): {
  startDate: string;
  endDateExclusive: string;
} {
  const localStart = toZonedTime(range.start, METRICS_TIME_ZONE);
  const localEnd = toZonedTime(range.end, METRICS_TIME_ZONE);
  const endIsDayBoundary =
    localEnd.getHours() === 0 &&
    localEnd.getMinutes() === 0 &&
    localEnd.getSeconds() === 0 &&
    localEnd.getMilliseconds() === 0;
  const endExclusive = endIsDayBoundary
    ? localEnd
    : addDays(startOfDay(localEnd), 1);

  return {
    startDate: format(localStart, "yyyy-MM-dd"),
    endDateExclusive: format(endExclusive, "yyyy-MM-dd"),
  };
}
