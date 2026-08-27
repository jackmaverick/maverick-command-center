import { describe, expect, it } from "vitest";

import { loopRegistry } from "./loop-registry";

describe("gutter invoice reconciliation proof patterns", () => {
  const gutterLoop = loopRegistry.find((entry) => entry.id === "gutter-invoice-reconciliation-loop");
  const proof = gutterLoop?.proofSources[0];

  it("does not treat unrelated dashboard failure wording as a gutter runtime failure", () => {
    const unrelatedDashboardText = JSON.stringify({
      automation_blocked_or_failed: 0,
      send_failed: 0,
      action: "Mark why the production text handoff failed."
    }).toLowerCase();

    expect(proof).toBeDefined();
    expect(
      proof?.failurePatterns?.some((pattern) => unrelatedDashboardText.includes(pattern.toLowerCase()))
    ).toBe(false);
  });

  it("still detects the gutter loop's explicit refresh failure marker", () => {
    const gutterFailure = JSON.stringify({
      warning: "gutter_invoice_reconciliation_fetch_failed_using_previous_dashboard"
    }).toLowerCase();

    expect(
      proof?.failurePatterns?.some((pattern) => gutterFailure.includes(pattern.toLowerCase()))
    ).toBe(true);
  });
});

describe("production communication closed loop", () => {
  const loop = loopRegistry.find((entry) => entry.id === "production-communication-closed-loop");

  it("registers the structured heartbeat and repair surface", () => {
    expect(loop).toBeDefined();
    expect(loop?.cadence).toBe("continuous");
    expect(loop?.actionSurface.name).toBe("Michelle Daily Touch List");
    expect(loop?.proofSources[0]?.path).toContain("production-communication-graph/health-latest.json");
    expect(loop?.proofSources[0]?.freshnessHours).toBe(0.75);
  });
});
