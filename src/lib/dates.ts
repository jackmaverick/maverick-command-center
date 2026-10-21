import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  startOfYear,
  subWeeks,
  subMonths,
  subDays,
  format,
  isSameMonth,
  isSameWeek,
  parseISO,
  isValid,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const APP_TIME_ZONE = "America/Chicago";
export const SALES_REFERENCE_START = "2026-04-06";
export const SALES_REFERENCE_END_EXCLUSIVE = "2026-10-07";

export type BasePeriodKey =
  | "reference"
  | "week"
  | "last_week"
  | "month"
  | "last_month"
  | "quarter"
  | "ytd"
  | "all";

export type PeriodKey = BasePeriodKey | `month:${string}` | `week:${string}`;

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export const BASE_PERIOD_KEYS: BasePeriodKey[] = [
  "reference",
  "week",
  "last_week",
  "month",
  "last_month",
  "quarter",
  "ytd",
  "all",
];

function ctBoundary(localDate: Date): Date {
  return fromZonedTime(localDate, APP_TIME_ZONE);
}

function currentAwareMonthRange(monthDate: Date, now = new Date()): DateRange {
  const localNow = toZonedTime(now, APP_TIME_ZONE);
  const start = startOfMonth(monthDate);
  return {
    start: ctBoundary(start),
    end: isSameMonth(monthDate, localNow)
      ? now
      : ctBoundary(endOfMonth(monthDate)),
    label: format(monthDate, "MMMM yyyy"),
  };
}

function currentAwareWeekRange(weekDate: Date, now = new Date()): DateRange {
  const localNow = toZonedTime(now, APP_TIME_ZONE);
  const start = startOfWeek(weekDate, { weekStartsOn: 1 });
  return {
    start: ctBoundary(start),
    end: isSameWeek(weekDate, localNow, { weekStartsOn: 1 })
      ? now
      : ctBoundary(endOfWeek(weekDate, { weekStartsOn: 1 })),
    label: `${format(start, "MMM d")} - ${format(endOfWeek(weekDate, { weekStartsOn: 1 }), "MMM d, yyyy")}`,
  };
}

export function isValidPeriodKey(period: string): period is PeriodKey {
  if ((BASE_PERIOD_KEYS as string[]).includes(period)) return true;

  if (period.startsWith("month:")) {
    const month = period.slice("month:".length);
    if (!/^\d{4}-\d{2}$/.test(month)) return false;
    const parsed = parseISO(`${month}-01`);
    return isValid(parsed);
  }

  if (period.startsWith("week:")) {
    const day = period.slice("week:".length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    return isValid(parseISO(day));
  }

  return false;
}

/**
 * Get a date range from a period key.
 */
export function getDateRange(period: PeriodKey | string): DateRange {
  const now = new Date();
  const localNow = toZonedTime(now, APP_TIME_ZONE);

  if (period.startsWith("month:")) {
    return currentAwareMonthRange(parseISO(`${period.slice("month:".length)}-01`));
  }

  if (period.startsWith("week:")) {
    return currentAwareWeekRange(parseISO(period.slice("week:".length)));
  }

  switch (period) {
    case "reference":
      return {
        start: ctBoundary(parseISO(SALES_REFERENCE_START)),
        end: ctBoundary(parseISO(SALES_REFERENCE_END_EXCLUSIVE)),
        label: "Apr 6 – Oct 6, 2026",
      };
    case "week":
      return {
        start: ctBoundary(startOfWeek(localNow, { weekStartsOn: 1 })),
        end: now,
        label: "This Week",
      };
    case "last_week": {
      const lastWeek = subWeeks(localNow, 1);
      return {
        start: ctBoundary(startOfWeek(lastWeek, { weekStartsOn: 1 })),
        end: ctBoundary(endOfWeek(lastWeek, { weekStartsOn: 1 })),
        label: "Last Week",
      };
    }
    case "month":
      return {
        start: ctBoundary(startOfMonth(localNow)),
        end: now,
        label: "This Month",
      };
    case "last_month": {
      const lastMonth = subMonths(localNow, 1);
      return {
        start: ctBoundary(startOfMonth(lastMonth)),
        end: ctBoundary(endOfMonth(lastMonth)),
        label: "Last Month",
      };
    }
    case "quarter":
      return {
        start: ctBoundary(startOfQuarter(localNow)),
        end: now,
        label: "This Quarter",
      };
    case "ytd":
      return {
        start: ctBoundary(startOfYear(localNow)),
        end: now,
        label: "Year to Date",
      };
    case "all":
      return {
        start: ctBoundary(parseISO("2020-01-01")),
        end: now,
        label: "All Time",
      };
    default:
      return getDateRange("month");
  }
}

export function getPreviousDateRange(period: PeriodKey | string): DateRange | null {
  const range = getDateRange(period);
  const localStart = toZonedTime(range.start, APP_TIME_ZONE);

  if (period === "reference") return null;

  if (period === "week" || period.startsWith("week:")) {
    return currentAwareWeekRange(subWeeks(localStart, 1));
  }

  if (period === "month" || period.startsWith("month:")) {
    return currentAwareMonthRange(subMonths(localStart, 1));
  }

  if (period === "last_week") {
    return currentAwareWeekRange(subWeeks(localStart, 1));
  }

  if (period === "last_month") {
    return currentAwareMonthRange(subMonths(localStart, 1));
  }

  return null;
}

export function getSelectableMonths(monthsBack = 18): { value: string; label: string }[] {
  const now = startOfMonth(toZonedTime(new Date(), APP_TIME_ZONE));
  return Array.from({ length: monthsBack }, (_, idx) => {
    const month = subMonths(now, idx);
    return {
      value: `month:${format(month, "yyyy-MM")}`,
      label: format(month, "MMMM yyyy"),
    };
  });
}

export function getSelectableWeeks(weeksBack = 12): { value: string; label: string }[] {
  const thisWeekStart = startOfWeek(toZonedTime(new Date(), APP_TIME_ZONE), {
    weekStartsOn: 1,
  });
  return Array.from({ length: weeksBack }, (_, idx) => {
    const weekStart = subWeeks(thisWeekStart, idx);
    return {
      value: `week:${format(weekStart, "yyyy-MM-dd")}`,
      label: `${format(weekStart, "MMM d")} - ${format(subDays(startOfWeek(subWeeks(thisWeekStart, idx - 1), { weekStartsOn: 1 }), 1), "MMM d")}`,
    };
  });
}

/**
 * Convert a JS Date to Unix seconds for JN BIGINT date columns.
 */
export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function formatCtDateKey(date: Date): string {
  return formatInTimeZone(date, APP_TIME_ZONE, "yyyy-MM-dd");
}

/**
 * Convert Unix seconds (BIGINT) to a JS Date.
 */
export function fromUnixSeconds(unix: number): Date {
  return new Date(unix * 1000);
}

/**
 * Format a date for display.
 */
export function formatDate(date: Date | string, fmt = "MMM d, yyyy"): string {
  return formatInTimeZone(
    typeof date === "string" ? new Date(date) : date,
    APP_TIME_ZONE,
    fmt
  );
}

/**
 * Format currency.
 */
export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format a percentage.
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
