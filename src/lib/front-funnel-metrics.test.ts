import { describe, expect, it } from "vitest";
import {
  automaticOpenerSql,
  bookedLeadSql,
  cleanLeadWhere,
  getMetricsDateRange,
  isMetricsPeriod,
} from "./front-funnel-metrics";

describe("front-funnel metric rules", () => {
  it("centralizes the clean lead and booking predicates", () => {
    expect(cleanLeadWhere("lead")).toBe("lead.excluded_sales = false");
    expect(bookedLeadSql("lead")).toContain(
      "booked_history.job_jnid = lead.jnid"
    );
    expect(bookedLeadSql("lead")).toContain("Appointment Scheduled");
  });

  it("centralizes both automatic opener sources", () => {
    const sql = automaticOpenerSql("message");
    expect(sql).toContain("website_leads website_opener");
    expect(sql).toContain("roofle_events roofle_opener");
    expect(sql).toContain("message.openphone_message_id");
  });

  it("uses Chicago midnight for a completed month", () => {
    const range = getMetricsDateRange(
      "month:2026-03",
      new Date("2026-10-07T05:00:00.000Z")
    );

    expect(range.start.toISOString()).toBe("2026-03-01T06:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-04-01T05:00:00.000Z");
  });

  it("starts the six-month window on a Chicago day boundary", () => {
    const range = getMetricsDateRange(
      "six_months",
      new Date("2026-10-07T17:42:00.000Z")
    );

    expect(range.start.toISOString()).toBe("2026-04-07T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-07T17:42:00.000Z");
  });

  it("starts Chicago weeks on Monday across daylight saving time", () => {
    const range = getMetricsDateRange(
      "week:2026-03-09",
      new Date("2026-10-07T05:00:00.000Z")
    );

    expect(range.start.toISOString()).toBe("2026-03-09T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-16T05:00:00.000Z");
  });

  it("rejects impossible custom period dates", () => {
    expect(isMetricsPeriod("month:2026-13")).toBe(false);
    expect(isMetricsPeriod("week:2026-02-31")).toBe(false);
    expect(isMetricsPeriod("month:2026-02")).toBe(true);
    expect(isMetricsPeriod("week:2026-02-28")).toBe(true);
  });
});
