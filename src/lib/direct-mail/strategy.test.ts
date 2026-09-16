import { describe, expect, it } from "vitest";
import { weeklyFixture } from "./weekly-fixture";
import {
  campaignClassificationCoverage,
  campaignStrategyPerformance,
} from "./strategy";

describe("campaign strategy performance", () => {
  it("compares reviewed audience strategies using requested-row denominators", () => {
    const d = weeklyFixture();
    d.campaigns.push({
      ...d.campaigns[0],
      id: "general-campaign",
      audienceStrategy: "general_audience",
      touchType: "resend",
      requested: 400,
      leads: 2,
      invoiced: 3000,
    });
    d.summary.requested = 500;
    const rows = campaignStrategyPerformance(d);
    expect(rows[0]).toMatchObject({
      audience: "job_scheduled_neighborhood",
      campaigns: 1,
      requested: 100,
      averageRequest: 100,
      leadsPerThousandRequested: 10,
      revenuePerThousandRequested: 10000,
    });
    expect(rows[1]).toMatchObject({
      audience: "general_audience",
      campaigns: 1,
      requested: 400,
      leadsPerThousandRequested: 5,
      revenuePerThousandRequested: 7500,
      touches: { resend: 1 },
    });
    expect(campaignClassificationCoverage(d)).toEqual({ classified: 2, total: 2 });
  });

  it("keeps legacy rows visibly unclassified", () => {
    const d = weeklyFixture();
    delete d.campaigns[0].audienceStrategy;
    delete d.campaigns[0].touchType;
    expect(campaignStrategyPerformance(d)[0].audience).toBe("unclassified");
    expect(campaignClassificationCoverage(d)).toEqual({ classified: 0, total: 1 });
  });
});
