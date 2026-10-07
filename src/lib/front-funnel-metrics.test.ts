import { describe, expect, it } from "vitest";
import {
  appointmentSetBroadAtSql,
  appointmentSetStrictAtSql,
  automaticOpenerSql,
  getMetricsDateRange,
  insuranceSoldAtSql,
  isAppointmentSetBroad,
  isAppointmentSetStrict,
  isCountableLead,
  isInsuranceSold,
  isMetricsPeriod,
} from "./front-funnel-metrics";

describe("front-funnel metric rules", () => {
  it("centralizes the countable lead predicate", () => {
    expect(isCountableLead("lead")).toContain("lead.excluded_sales = false");
    expect(isCountableLead("lead")).toContain(
      "lead.storm_alert_prospect = false"
    );
  });

  it("centralizes broad and strict appointment-set definitions", () => {
    expect(appointmentSetStrictAtSql("lead")).toContain(
      "strict_history.job_jnid = lead.jnid"
    );
    expect(appointmentSetStrictAtSql("lead")).toContain(
      "Appointment Scheduled"
    );
    expect(appointmentSetBroadAtSql("lead")).toContain("workflow_stages");
    expect(appointmentSetBroadAtSql("lead")).toContain("tasks appointment_task");
    expect(isAppointmentSetBroad("lead")).toContain("IS NOT NULL");
    expect(isAppointmentSetStrict("lead")).toContain("IS NOT NULL");
  });

  it("starts insurance sold at Deductible Collected, not approval", () => {
    const soldSql = insuranceSoldAtSql("lead");
    expect(soldSql).toContain("Deductible Collected");
    expect(soldSql).not.toContain("Fully Approved");
    expect(soldSql).not.toContain("Deductible Invoice Sent");
    expect(isInsuranceSold("lead")).toContain(
      "lead.record_type_name = 'Insurance'"
    );
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
