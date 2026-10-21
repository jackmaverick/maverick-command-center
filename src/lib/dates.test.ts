import { afterEach, describe, expect, it, vi } from "vitest";
import { getDateRange } from "./dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("America/Chicago period boundaries", () => {
  it("uses CDT midnight during summer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));

    expect(getDateRange("month").start.toISOString()).toBe(
      "2026-07-01T05:00:00.000Z"
    );
  });

  it("uses CST midnight during winter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

    expect(getDateRange("month").start.toISOString()).toBe(
      "2026-01-01T06:00:00.000Z"
    );
  });

  it("uses the approved CT reference window", () => {
    const range = getDateRange("reference");
    expect(range.start.toISOString()).toBe("2026-04-06T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-07T05:00:00.000Z");
  });
});
