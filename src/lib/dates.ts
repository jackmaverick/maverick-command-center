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

export type BasePeriodKey =
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
  "week",
  "last_week",
  "month",
  "last_month",
  "quarter",
  "ytd",
  "all",
];

function currentAwareMonthRange(monthDate: Date): DateRange {
  const now = new Date();
  const start = startOfMonth(monthDate);
  return {
    start,
    end: isSameMonth(monthDate, now) ? now : endOfMonth(monthDate),
    label: format(monthDate, "MMMM yyyy"),
  };
}

function currentAwareWeekRange(weekDate: Date): DateRange {
  const now = new Date();
  const start = startOfWeek(weekDate, { weekStartsOn: 1 });
  return {
    start,
    end: isSameWeek(weekDate, now, { weekStartsOn: 1 }) ? now : endOfWeek(weekDate, { weekStartsOn: 1 }),
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

  if (period.startsWith("month:")) {
    return currentAwareMonthRange(parseISO(`${period.slice("month:".length)}-01`));
  }

  if (period.startsWith("week:")) {
    return currentAwareWeekRange(parseISO(period.slice("week:".length)));
  }

  switch (period) {
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: now,
        label: "This Week",
      };
    case "last_week": {
      const lastWeek = subWeeks(now, 1);
      return {
        start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        end: endOfWeek(lastWeek, { weekStartsOn: 1 }),
        label: "Last Week",
      };
    }
    case "month":
      return {
        start: startOfMonth(now),
        end: now,
        label: "This Month",
      };
    case "last_month": {
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
        label: "Last Month",
      };
    }
    case "quarter":
      return {
        start: startOfQuarter(now),
        end: now,
        label: "This Quarter",
      };
    case "ytd":
      return {
        start: startOfYear(now),
        end: now,
        label: "Year to Date",
      };
    case "all":
      return {
        start: new Date("2020-01-01"),
        end: now,
        label: "All Time",
      };
    default:
      return getDateRange("month");
  }
}

export function getPreviousDateRange(period: PeriodKey | string): DateRange | null {
  const range = getDateRange(period);

  if (period === "week" || period.startsWith("week:")) {
    return currentAwareWeekRange(subWeeks(range.start, 1));
  }

  if (period === "month" || period.startsWith("month:")) {
    return currentAwareMonthRange(subMonths(range.start, 1));
  }

  if (period === "last_week") {
    return currentAwareWeekRange(subWeeks(range.start, 1));
  }

  if (period === "last_month") {
    return currentAwareMonthRange(subMonths(range.start, 1));
  }

  return null;
}

export function getSelectableMonths(monthsBack = 18): { value: string; label: string }[] {
  const now = startOfMonth(new Date());
  return Array.from({ length: monthsBack }, (_, idx) => {
    const month = subMonths(now, idx);
    return {
      value: `month:${format(month, "yyyy-MM")}`,
      label: format(month, "MMMM yyyy"),
    };
  });
}

export function getSelectableWeeks(weeksBack = 12): { value: string; label: string }[] {
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
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
  return format(typeof date === "string" ? new Date(date) : date, fmt);
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
