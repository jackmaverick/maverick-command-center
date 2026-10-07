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

export const CLEAN_LEAD_DEFINITION =
  "Clean leads from metrics.v_jobs_clean where excluded_sales = false";

export function cleanLeadWhere(alias = "j"): string {
  return `${alias}.excluded_sales = false`;
}

export const BOOKED_DEFINITION =
  "Booked = reached an appointment-scheduled stage in JobNimbus history";

export const BOOKED_STAGE_NAMES = [
  "Appointment Scheduled",
  "Appt Scheduled",
  "Storm Inspection Scheduled",
  "Adjuster Appt Scheduled",
] as const;

export function bookedAtSql(alias = "j"): string {
  const stages = BOOKED_STAGE_NAMES.map((stage) => `'${stage}'`).join(", ");
  return `(
    SELECT MIN(booked_history.changed_at)
    FROM job_stage_history booked_history
    WHERE booked_history.job_jnid = ${alias}.jnid
      AND booked_history.to_stage_name IN (${stages})
  )`;
}

/**
 * Keep the unsettled booking rule behind one named function. When Jack settles
 * the definition, this is the only SQL predicate that needs to change.
 */
export function bookedLeadSql(alias = "j"): string {
  return `${bookedAtSql(alias)} IS NOT NULL`;
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
