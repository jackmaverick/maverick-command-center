import { describe, expect, it } from "vitest";

import { codexProjectFor } from "./loop-health";
import { shouldPublishGenericLoopSnapshot } from "./loop-health-publication";
import { loopRegistry } from "./loop-registry";
import { loopGraphById, loopGraphDefinitions } from "./loop-graph";

describe("gutter invoice reconciliation proof patterns", () => {
  const gutterLoop = loopRegistry.find(
    (entry) => entry.id === "gutter-invoice-reconciliation-loop",
  );
  const proof = gutterLoop?.proofSources[0];

  it("does not treat unrelated dashboard failure wording as a gutter runtime failure", () => {
    const unrelatedDashboardText = JSON.stringify({
      automation_blocked_or_failed: 0,
      send_failed: 0,
      action: "Mark why the production text handoff failed.",
    }).toLowerCase();

    expect(proof).toBeDefined();
    expect(
      proof?.failurePatterns?.some((pattern) =>
        unrelatedDashboardText.includes(pattern.toLowerCase()),
      ),
    ).toBe(false);
  });

  it("still detects the gutter loop's explicit refresh failure marker", () => {
    const gutterFailure = JSON.stringify({
      warning:
        "gutter_invoice_reconciliation_fetch_failed_using_previous_dashboard",
    }).toLowerCase();

    expect(
      proof?.failurePatterns?.some((pattern) =>
        gutterFailure.includes(pattern.toLowerCase()),
      ),
    ).toBe(true);
  });
});

describe("production communication closed loop", () => {
  const loop = loopRegistry.find(
    (entry) => entry.id === "production-communication-closed-loop",
  );

  it("registers the structured heartbeat and repair surface", () => {
    expect(loop).toBeDefined();
    expect(loop?.cadence).toBe("continuous");
    expect(loop?.actionSurface.name).toBe("Michelle Daily Touch List");
    expect(loop?.proofSources[0]?.path).toContain(
      "production-communication-graph/health-latest.json",
    );
    expect(loop?.proofSources[0]?.freshnessHours).toBe(0.75);
  });
});

describe("invoice due-date autonomous loop", () => {
  const loop = loopRegistry.find((entry) => entry.id === "invoice-due-date-alignment-loop");

  it("uses Command Center health instead of a Daily Touch action queue", () => {
    expect(loop).toBeDefined();
    expect(loop?.approvalRequired).toBe(false);
    expect(loop?.actionSurface.name).toBe("Command Center Loop Health");
    expect(loop?.actionSurface.pathOrUrl).toBe("/loop-health");
    expect(loop?.proofSources[0]?.path).toContain("invoice-due-date-loop/health-latest.json");
    expect(loop?.proofSources[0]?.freshnessHours).toBe(20);
  });

  it("ages missed scheduled runs into stale health", () => {
    const graph = loopGraphById.get("invoice-due-date-alignment-loop");

    expect(graph?.runtimeSignals).toContainEqual({
      source: "launchd",
      loopName: "com.maverick.invoice-due-date-loop",
      label: "Invoice due-date runner",
    });
    expect(graph?.maxSnapshotAgeHours).toBe(20);
    expect(graph?.maxRunAgeHours).toBe(20);
  });

  it("keeps the generic collector from overwriting runner-owned proof", () => {
    expect(shouldPublishGenericLoopSnapshot("invoice-due-date-alignment-loop")).toBe(false);
    expect(shouldPublishGenericLoopSnapshot("stuck-status-jobs")).toBe(true);
  });

  it("routes repair work to the dedicated clean main runner", () => {
    expect(codexProjectFor(loop!)).toMatchObject({
      projectName: "Invoice Due Date Loop",
      folder: "/Users/maverick_ai/runners/invoice-due-dates/supabase-maverick-exteriors",
      repo: "jackmaverick/supabase-maverick-exteriors",
      branch: "main",
    });
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
    const dependencyIds = loopGraphDefinitions.flatMap(
      (entry) => entry.dependsOn,
    );

    expect(dependencyIds.filter((id) => !registryIds.has(id))).toEqual([]);
  });

  it("does not create dependency cycles", () => {
    const dependencies = new Map(
      loopGraphDefinitions.map((entry) => [entry.loopId, entry.dependsOn]),
    );

    const visit = (id: string, path: string[]): void => {
      expect(path).not.toContain(id);
      for (const dependency of dependencies.get(id) ?? [])
        visit(dependency, [...path, id]);
    };

    for (const id of dependencies.keys()) visit(id, []);
  });

  it("keeps materials and install dates in one production schedule graph", () => {
    const productionGraph = loopGraphDefinitions.find(
      (entry) => entry.loopId === "production-communication-closed-loop",
    );

    expect(productionGraph?.simplification.action).toBe("keep");
    expect(productionGraph?.simplification.reason).toContain(
      "one schedule version",
    );
  });

  it("gives the due-date scheduler one health owner", () => {
    const owners = loopGraphDefinitions.filter((definition) =>
      definition.runtimeSignals.some(
        (signal) => signal.loopName === "com.maverick.invoice-due-date-loop",
      ),
    );

    expect(owners.map((definition) => definition.loopId)).toEqual([
      "invoice-due-date-alignment-loop",
    ]);
  });

  it("places GAF measurement entry upstream of appointment prep", () => {
    const gafLoop = loopRegistry.find(
      (entry) => entry.id === "gaf_measurements_to_jobnimbus",
    );
    const gafGraph = loopGraphDefinitions.find(
      (entry) => entry.loopId === "gaf_measurements_to_jobnimbus",
    );
    const appointmentPrep = loopGraphDefinitions.find(
      (entry) => entry.loopId === "appointment-prep-loop",
    );

    expect(gafLoop?.cadence).toBe("daily");
    expect(gafLoop?.businessPromise).toContain("fresh readback");
    expect(gafGraph?.family).toBe("sales");
    expect(gafGraph?.runtimeSignals).toEqual([
      {
        source: "runner",
        loopName: "gaf_measurements_to_jobnimbus",
        label: "GAF measurements owning runner",
      },
    ]);
    expect(appointmentPrep?.dependsOn).toContain(
      "gaf_measurements_to_jobnimbus",
    );
  });
});
