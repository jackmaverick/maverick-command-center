import { describe, expect, it } from "vitest";

import {
  enforceBusinessProofContract,
  GAF_MEASUREMENT_CONTRACT_VERSION,
  GAF_MEASUREMENT_LOOP_ID,
} from "./loop-business-proof";
import type { LoopHealthEvaluation } from "./loop-health-evaluation";
import type { LoopHealthSnapshot } from "./loop-health-snapshots";

const healthyEvaluation: LoopHealthEvaluation = {
  status: "healthy",
  reportedStatus: "healthy",
  monitorStatus: "healthy",
  reason: "Runner reported healthy.",
  snapshotAgeHours: 1,
  runAgeHours: 1,
};

function snapshot(details: Record<string, unknown>): LoopHealthSnapshot {
  return {
    loopId: GAF_MEASUREMENT_LOOP_ID,
    status: "healthy",
    ranAt: "2026-08-27T20:00:00.000Z",
    checkedAt: "2026-08-27T20:05:00.000Z",
    proofLabel: "GAF measurement run",
    proofPath: "runner:gaf_measurements_to_jobnimbus",
    proofSummary: "Runner reported healthy.",
    proofEvidence: null,
    lastProof: null,
    nextAction: null,
    approvalRequired: false,
    sourceRepoPath: null,
    sourceRepo: null,
    sourceBranch: null,
    healthSource: "gaf-runner",
    details,
  };
}

const baseCounts = {
  discovered: 2,
  eligible: 2,
  applied_verified: 2,
  nothing_to_change_verified: 0,
  blocked_source: 0,
  blocked_conflict: 0,
  browser_failed: 0,
  writes: 2,
  verified_readbacks: 2,
};

function contract(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: GAF_MEASUREMENT_CONTRACT_VERSION,
    outcome: "applied_verified",
    source_provenance: "verified_attached_report",
    counts: { ...baseCounts },
    ...overrides,
  };
}

describe("GAF measurements business-proof contract", () => {
  it("accepts verified mutations with matching fresh readbacks", () => {
    const result = enforceBusinessProofContract({
      loopId: GAF_MEASUREMENT_LOOP_ID,
      snapshot: snapshot(contract()),
      evaluation: healthyEvaluation,
    });

    expect(result.status).toBe("healthy");
    expect(result.reason).toContain("independently read back");
  });

  it("accepts an explicitly verified zero-work outcome", () => {
    const result = enforceBusinessProofContract({
      loopId: GAF_MEASUREMENT_LOOP_ID,
      snapshot: snapshot(
        contract({
          outcome: "nothing_to_change_verified",
          counts: {
            ...baseCounts,
            applied_verified: 0,
            nothing_to_change_verified: 2,
            writes: 0,
            verified_readbacks: 0,
          },
        }),
      ),
      evaluation: healthyEvaluation,
    });

    expect(result.status).toBe("healthy");
    expect(result.reason).toContain("no JobNimbus write was needed");
  });

  it("rejects a healthy label without the structured count contract", () => {
    const result = enforceBusinessProofContract({
      loopId: GAF_MEASUREMENT_LOOP_ID,
      snapshot: snapshot({ deployed: true, queue_scanned: true }),
      evaluation: healthyEvaluation,
    });

    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("count contract");
  });

  it("fails when writes do not have matching verified readbacks", () => {
    const result = enforceBusinessProofContract({
      loopId: GAF_MEASUREMENT_LOOP_ID,
      snapshot: snapshot(
        contract({ counts: { ...baseCounts, verified_readbacks: 1 } }),
      ),
      evaluation: healthyEvaluation,
    });

    expect(result.status).toBe("failing");
    expect(result.reason).toContain("2 write(s)");
  });

  it("warns when source or conflict blockers remain", () => {
    const result = enforceBusinessProofContract({
      loopId: GAF_MEASUREMENT_LOOP_ID,
      snapshot: snapshot(
        contract({ counts: { ...baseCounts, blocked_source: 1 } }),
      ),
      evaluation: healthyEvaluation,
    });

    expect(result.status).toBe("warning");
    expect(result.reason).toContain("source-provenance blocker");
  });
});
