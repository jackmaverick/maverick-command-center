import { describe, expect, it } from "vitest";

import { evaluateLoopHealth } from "./loop-health-evaluation";
import type { LoopHealthSnapshot, LoopRuntimeSignal } from "./loop-health-snapshots";

const now = new Date("2026-08-27T21:30:00.000Z");

function snapshot(overrides: Partial<LoopHealthSnapshot> = {}): LoopHealthSnapshot {
  return {
    loopId: "test-loop",
    status: "healthy",
    ranAt: "2026-08-27T21:00:00.000Z",
    checkedAt: "2026-08-27T21:05:00.000Z",
    proofLabel: "test proof",
    proofPath: "test",
    proofSummary: "Fresh success proof.",
    proofEvidence: null,
    lastProof: "Fresh success proof.",
    nextAction: null,
    approvalRequired: false,
    sourceRepoPath: null,
    sourceRepo: null,
    sourceBranch: null,
    healthSource: "test",
    details: {},
    ...overrides,
  };
}

function runtime(overrides: Partial<LoopRuntimeSignal> = {}): LoopRuntimeSignal {
  return {
    source: "launchd",
    loopName: "com.maverick.test",
    label: "Test runtime",
    status: "ok",
    detail: "last exit 0",
    lastRunAt: null,
    schedule: null,
    snapshotAt: "2026-08-27T21:20:00.000Z",
    ...overrides,
  };
}

describe("evaluateLoopHealth", () => {
  it("keeps fresh business proof healthy when the required runtime is healthy", () => {
    const result = evaluateLoopHealth({
      snapshot: snapshot(),
      runtimeSignals: [runtime()],
      requiredRuntimeSignalCount: 1,
      localStatus: null,
      maxSnapshotAgeHours: 1,
      maxRunAgeHours: 1,
      now,
    });

    expect(result.status).toBe("healthy");
    expect(result.monitorStatus).toBe("healthy");
  });

  it("does not allow a three-week-old healthy snapshot to stay green", () => {
    const result = evaluateLoopHealth({
      snapshot: snapshot({
        ranAt: "2026-08-03T19:01:07.339Z",
        checkedAt: "2026-08-03T19:42:06.003Z",
      }),
      runtimeSignals: [runtime()],
      requiredRuntimeSignalCount: 1,
      localStatus: null,
      maxSnapshotAgeHours: 36,
      maxRunAgeHours: 36,
      now,
    });

    expect(result.status).toBe("stale");
    expect(result.reportedStatus).toBe("healthy");
    expect(result.reason).toContain("not current");
  });

  it("does not present an old failing snapshot as a current failure", () => {
    const result = evaluateLoopHealth({
      snapshot: snapshot({
        status: "failing",
        ranAt: "2026-08-03T19:18:31.176Z",
        checkedAt: "2026-08-03T19:42:06.003Z",
      }),
      runtimeSignals: [runtime()],
      requiredRuntimeSignalCount: 1,
      localStatus: null,
      maxSnapshotAgeHours: 36,
      maxRunAgeHours: 36,
      now,
    });

    expect(result.status).toBe("stale");
    expect(result.reportedStatus).toBe("failing");
  });

  it("makes a current scheduler failure red even when the old business snapshot was healthy", () => {
    const result = evaluateLoopHealth({
      snapshot: snapshot({
        ranAt: "2026-08-03T19:01:07.339Z",
        checkedAt: "2026-08-03T19:42:06.003Z",
      }),
      runtimeSignals: [runtime({ status: "red", detail: "last exit code 1" })],
      requiredRuntimeSignalCount: 1,
      localStatus: null,
      maxSnapshotAgeHours: 36,
      maxRunAgeHours: 36,
      now,
    });

    expect(result.status).toBe("failing");
    expect(result.reason).toContain("last exit code 1");
  });

  it("shows intentionally stopped scheduler clusters as paused", () => {
    const result = evaluateLoopHealth({
      snapshot: snapshot(),
      runtimeSignals: [runtime({ status: "paused", detail: "job is paused" })],
      requiredRuntimeSignalCount: 1,
      localStatus: null,
      maxSnapshotAgeHours: 36,
      maxRunAgeHours: 36,
      now,
    });

    expect(result.status).toBe("paused");
  });
});
