import { afterEach, describe, expect, it, vi } from "vitest";
import { getDateRange, toUnixSeconds } from "./dates";

describe("exclusive reporting period boundaries", () => {
  afterEach(() => vi.useRealTimers());

  it("includes the last second of a completed month in timestamp and date queries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    for (const period of ["last_month", "month:2026-09"]) {
      const range = getDateRange(period);
      expect(range.end).toEqual(new Date(2026, 9, 1));
      expect(toUnixSeconds(new Date(2026, 8, 30, 23, 59, 59))).toBeLessThan(toUnixSeconds(range.end));
      expect(range.end.getDate()).toBe(1);
    }
  });

  it("uses the following Monday as the exclusive completed week end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    for (const period of ["last_week", "week:2026-09-28"]) {
      const range = getDateRange(period);
      expect(range.end).toEqual(new Date(2026, 9, 5));
      expect(toUnixSeconds(new Date(2026, 9, 4, 23, 59, 59))).toBeLessThan(toUnixSeconds(range.end));
    }
  });

  it("keeps an in-progress period capped at now", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 9, 6, 12);
    vi.setSystemTime(now);
    expect(getDateRange("month:2026-10").end).toEqual(now);
    expect(getDateRange("week:2026-10-05").end).toEqual(now);
  });
});
