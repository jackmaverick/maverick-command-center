import { describe, expect, it } from "vitest";
import {
  SALES_FUNNEL_JOBS_VIEW,
  STATUS_FUNNEL_STAGE_TABLE,
  automaticOpenerSql,
  funnelCreatedDateWhere,
  getMetricsCreatedDateBounds,
  getMetricsDateRange,
  isAppointmentSetBroad,
  isAppointmentSetStrict,
  isCountableLead,
  isInsuranceSold,
  isMetricsPeriod,
  salesFunnelJobsSql,
  statusFunnelStageSql,
} from "./front-funnel-metrics";

describe("front-funnel metric rules", () => {
  it("centralizes migration-10 object and cohort names", () => {
    expect(salesFunnelJobsSql("lead")).toBe(
      `${SALES_FUNNEL_JOBS_VIEW} lead`
    );
    expect(statusFunnelStageSql("stage")).toBe(
      `${STATUS_FUNNEL_STAGE_TABLE} stage`
    );
    expect(isCountableLead("lead")).toBe("lead.job_id IS NOT NULL");
    expect(funnelCreatedDateWhere("lead", "$1", "$2")).toContain(
      "lead.created_ct >= $1::date"
    );
  });

  it("uses view flags for broad and strict appointment definitions", () => {
    expect(isAppointmentSetBroad("lead")).toBe(
      "lead.appt_set_broad = true"
    );
    expect(isAppointmentSetStrict("lead")).toBe(
      "lead.appt_set_strict = true"
    );
  });

  it("uses the migration-10 insurance sold flag", () => {
    expect(isInsuranceSold("lead")).toBe("lead.insurance_sold = true");
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

  it("reproduces the approved reference cohort date bounds", () => {
    const range = getMetricsDateRange("reference");
    expect(range.start.toISOString()).toBe("2026-04-06T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-07T05:00:00.000Z");
    expect(getMetricsCreatedDateBounds(range)).toEqual({
      startDate: "2026-04-06",
      endDateExclusive: "2026-10-07",
    });
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
