import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  startOfYear,
  subWeeks,
  subMonths,
  format,
} from "date-fns";

export type PeriodKey =
  | "week"
  | "last_week"
  | "month"
  | "last_month"
  | "quarter"
  | "ytd"
  | "all";

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Get a date range from a period key.
 */
export function getDateRange(period: PeriodKey): DateRange {
  const now = new Date();

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
  }
}

/**
 * Convert a JS Date to Unix seconds (for JN BIGINT date columns).
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
