import { describe, expect, it } from "vitest";

import { loopRegistry } from "./loop-registry";
import { loopGraphDefinitions } from "./loop-graph";

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

describe("loop graph registry", () => {
  it("maps every dashboard loop exactly once", () => {
    const registryIds = loopRegistry.map((entry) => entry.id).sort();
    const graphIds = loopGraphDefinitions.map((entry) => entry.loopId).sort();

    expect(graphIds).toEqual(registryIds);
    expect(new Set(graphIds).size).toBe(graphIds.length);
  });

  it("references only registered dependency loops", () => {
    const registryIds = new Set(loopRegistry.map((entry) => entry.id));
    const dependencyIds = loopGraphDefinitions.flatMap((entry) => entry.dependsOn);

    expect(dependencyIds.filter((id) => !registryIds.has(id))).toEqual([]);
  });

  it("does not create dependency cycles", () => {
    const dependencies = new Map(loopGraphDefinitions.map((entry) => [entry.loopId, entry.dependsOn]));

    const visit = (id: string, path: string[]): void => {
      expect(path).not.toContain(id);
      for (const dependency of dependencies.get(id) ?? []) visit(dependency, [...path, id]);
    };

    for (const id of dependencies.keys()) visit(id, []);
  });

  it("keeps materials and install dates in one production schedule graph", () => {
    const productionGraph = loopGraphDefinitions.find(
      (entry) => entry.loopId === "production-communication-closed-loop"
    );

    expect(productionGraph?.simplification.action).toBe("keep");
    expect(productionGraph?.simplification.reason).toContain("one schedule version");
  });
});
