import { describe, it, expect } from "vitest";
import {
  buildLagTable,
  resolveLag,
  loadLagMeasurements,
  WORKTYPE_ALL,
  type LagMeasurement,
} from "./cashflow-lag";

function m(
  segment: LagMeasurement["segment"],
  workType: string,
  sampleCount: number,
  medianDays = 17
): LagMeasurement {
  return { segment, workType, step: "invoice_to_paid", medianDays, sampleCount };
}

describe("resolveLag — hierarchical fallback", () => {
  it("uses the specific segment x work-type bucket when it clears the floor", () => {
    const table = buildLagTable([m("insurance", "roof", 12, 10)]);
    const r = resolveLag(table, "insurance", "roof", "invoice_to_paid");
    expect(r.days).toBe(10);
    expect(r.level).toBe("segment_worktype");
    expect(r.confidence).toBe("medium");
  });

  it("marks a large specific sample as high confidence", () => {
    const table = buildLagTable([m("insurance", "roof", 25, 10)]);
    const r = resolveLag(table, "insurance", "roof", "invoice_to_paid");
    expect(r.confidence).toBe("high");
  });

  it("falls back to segment level when the work-type slice is too thin", () => {
    // roof+gutter has only 6 samples; segment-level has plenty.
    const table = buildLagTable([
      m("insurance", "roof_gutter", 6, 20),
      m("insurance", WORKTYPE_ALL, 40, 17),
    ]);
    const r = resolveLag(table, "insurance", "roof_gutter", "invoice_to_paid");
    expect(r.days).toBe(17);
    expect(r.level).toBe("segment");
    expect(r.confidence).toBe("medium");
  });

  it("falls back to global when neither work-type nor segment clears the floor", () => {
    const table = buildLagTable([m("other", WORKTYPE_ALL, 50, 21)]);
    const r = resolveLag(table, "insurance", "roof_gutter", "invoice_to_paid");
    expect(r.days).toBe(21);
    expect(r.level).toBe("global");
  });

  it("returns the most specific thin bucket as low confidence when nothing clears the floor", () => {
    const table = buildLagTable([m("insurance", "roof", 3, 9)]);
    const r = resolveLag(table, "insurance", "roof", "invoice_to_paid");
    expect(r.days).toBe(9);
    expect(r.level).toBe("segment_worktype");
    expect(r.confidence).toBe("low");
  });

  it("returns the hard default with confidence none when no data exists at any level", () => {
    const table = buildLagTable([]);
    const r = resolveLag(table, "insurance", "roof", "invoice_to_paid");
    expect(r.confidence).toBe("none");
    expect(r.level).toBe("default");
    expect(r.days).toBe(14); // DEFAULTS.invoice_to_paid
  });

  it("honors a custom sample floor", () => {
    const table = buildLagTable([m("insurance", "roof", 6, 10)]);
    const clears = resolveLag(table, "insurance", "roof", "invoice_to_paid", {
      sampleFloor: 5,
    });
    expect(clears.confidence).toBe("medium");
  });
});

describe("loadLagMeasurements — SQL loader", () => {
  it("excludes null medians and rounds days, tagging workType=all", async () => {
    const fakeRows = [
      { segment: "insurance", step: "invoice_to_paid", median_days: "16.94", sample_count: "11" },
      { segment: "retail", step: "invoice_to_paid", median_days: null, sample_count: "0" },
    ];
    const query = async () => fakeRows as never;
    const out = await loadLagMeasurements(query, "'insurance'", 180);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      segment: "insurance",
      workType: WORKTYPE_ALL,
      step: "invoice_to_paid",
      medianDays: 16.9,
      sampleCount: 11,
    });
  });

  it("passes the trailing window as a parameter", async () => {
    let capturedParams: unknown[] | undefined;
    const query = async (_sql: string, params?: unknown[]) => {
      capturedParams = params;
      return [] as never;
    };
    await loadLagMeasurements(query, "'retail'", 90);
    expect(capturedParams).toEqual([90]);
  });
});
