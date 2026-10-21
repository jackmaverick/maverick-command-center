import { describe, expect, it } from "vitest";
import { queryOne } from "@/lib/db";
import {
  getMetricsCreatedDateBounds,
  getMetricsDateRange,
} from "@/lib/front-funnel-metrics";
import { SQL } from "./route";

const runIntegration = Boolean(process.env.DATABASE_URL);

describe.runIf(runIntegration)("front-funnel SQL integration", () => {
  it("executes against the actual metrics view definitions", async () => {
    const now = new Date();
    const range = getMetricsDateRange("reference", now);
    const bounds = getMetricsCreatedDateBounds(range);
    const result = await queryOne<{
      funnel: { leads: number };
      sales_summary: {
        soldValue: number;
        staleEstimates14: number;
        billedRevenue: number;
      };
    }>(SQL, [
      range.start.toISOString(),
      range.end.toISOString(),
      now.toISOString(),
      bounds.startDate,
      bounds.endDateExclusive,
    ]);

    expect(result).not.toBeNull();
    expect(result?.funnel.leads).toBeGreaterThan(0);
    expect(result?.sales_summary.soldValue).toBeGreaterThan(0);
    expect(result?.sales_summary.staleEstimates14).toBeGreaterThanOrEqual(0);
    expect(result?.sales_summary.billedRevenue).toBeGreaterThan(0);
  });
});
