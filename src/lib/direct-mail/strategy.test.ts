import { describe, expect, it } from "vitest";
import { weeklyFixture } from "./weekly-fixture";
import {
  campaignClassificationCoverage,
  campaignOperatingSignal,
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

  it("recommends automating scheduled runs when both directional signals lead", () => {
    const d = weeklyFixture();
    d.costReview = {
      reviewedAt: "2026-09-16T12:00:00Z",
      invoiceStamps: [{ number: "test-1", amount: 0 }],
      allocations: [
        {
          campaignId: d.campaigns[0].id,
          invoiceNumber: "test-1",
          vendorCost: 10,
          method: "allocated",
          postal: {
            documentId: "scheduled-postage",
            pieces: 100,
            total: 10,
            net: 10,
            stamps: "outside_vendor",
            evidence: "https://example.com/scheduled-postage",
          },
          gaps: [],
          note: "Synthetic complete cost",
        },
        {
          campaignId: "general-campaign",
          invoiceNumber: "test-1",
          vendorCost: 40,
          method: "allocated",
          postal: {
            documentId: "general-postage",
            pieces: 1000,
            total: 1000,
            net: 1000,
            stamps: "outside_vendor",
            evidence: "https://example.com/general-postage",
          },
          gaps: [],
          note: "Synthetic complete cost",
        },
      ],
    };
    d.campaigns.push({
      ...d.campaigns[0],
      id: "general-campaign",
      audienceStrategy: "general_audience",
      requested: 1000,
      leads: 2,
      invoiced: 2000,
    });

    expect(campaignOperatingSignal(d)).toMatchObject({
      recommendation:
        "Automate scheduled-neighborhood runs; use general drops for scale.",
      scheduledLeadsAhead: true,
      scheduledRoasAhead: true,
    });
  });

  it("withholds the automation preference when the directional signal is mixed", () => {
    const d = weeklyFixture();
    d.campaigns.push({
      ...d.campaigns[0],
      id: "general-campaign",
      audienceStrategy: "general_audience",
      requested: 100,
      leads: 20,
      invoiced: 2000,
    });

    expect(campaignOperatingSignal(d)).toMatchObject({
      recommendation:
        "Keep both lanes in the monthly plan while the performance signal develops.",
      scheduledLeadsAhead: false,
    });
  });
});
