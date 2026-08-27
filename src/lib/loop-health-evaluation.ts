import type { LoopStatus } from "@/lib/loop-registry";
import type { LoopHealthSnapshot, LoopRuntimeSignal } from "@/lib/loop-health-snapshots";

export type MonitorStatus = "healthy" | "warning" | "failing" | "paused" | "unknown";

export interface LoopHealthEvaluation {
  status: LoopStatus;
  reportedStatus: LoopStatus | null;
  monitorStatus: MonitorStatus;
  reason: string;
  snapshotAgeHours: number | null;
  runAgeHours: number | null;
}

function hoursSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, (now.getTime() - timestamp) / 3_600_000);
}

export function aggregateRuntimeStatus(signals: LoopRuntimeSignal[]): MonitorStatus {
  if (signals.length === 0) return "unknown";
  if (signals.some((signal) => signal.status === "red")) return "failing";
  if (signals.every((signal) => signal.status === "paused")) return "paused";
  if (signals.some((signal) => signal.status === "stale" || signal.status === "unknown")) return "warning";
  return "healthy";
}

export function evaluateLoopHealth({
  snapshot,
  runtimeSignals,
  requiredRuntimeSignalCount,
  localStatus,
  maxSnapshotAgeHours,
  maxRunAgeHours,
  now = new Date(),
}: {
  snapshot: LoopHealthSnapshot | null;
  runtimeSignals: LoopRuntimeSignal[];
  requiredRuntimeSignalCount: number;
  localStatus: LoopStatus | null;
  maxSnapshotAgeHours: number | null;
  maxRunAgeHours: number | null;
  now?: Date;
}): LoopHealthEvaluation {
  const monitorStatus = aggregateRuntimeStatus(runtimeSignals);
  const snapshotAgeHours = hoursSince(snapshot?.checkedAt ?? null, now);
  const runAgeHours = hoursSince(snapshot?.ranAt ?? snapshot?.checkedAt ?? null, now);
  const missingRequiredRuntime = runtimeSignals.length < requiredRuntimeSignalCount;

  if (monitorStatus === "failing") {
    const failed = runtimeSignals.find((signal) => signal.status === "red");
    return {
      status: "failing",
      reportedStatus: snapshot?.status ?? null,
      monitorStatus,
      reason: failed
        ? `${failed.label ?? failed.loopName} is reporting a runtime failure: ${failed.detail}`
        : "A required runtime dependency is failing.",
      snapshotAgeHours,
      runAgeHours,
    };
  }

  if (monitorStatus === "paused" && runtimeSignals.length >= requiredRuntimeSignalCount) {
    return {
      status: "paused",
      reportedStatus: snapshot?.status ?? null,
      monitorStatus,
      reason: "All required schedulers for this loop are intentionally paused.",
      snapshotAgeHours,
      runAgeHours,
    };
  }

  if (snapshot) {
    if (maxSnapshotAgeHours !== null && snapshotAgeHours !== null && snapshotAgeHours > maxSnapshotAgeHours) {
      return {
        status: "stale",
        reportedStatus: snapshot.status,
        monitorStatus: missingRequiredRuntime ? "warning" : monitorStatus,
        reason: `The health collector has not published for ${Math.round(snapshotAgeHours)} hours; the stored ${snapshot.status} result is not current.`,
        snapshotAgeHours,
        runAgeHours,
      };
    }

    if (maxRunAgeHours !== null && runAgeHours !== null && runAgeHours > maxRunAgeHours) {
      return {
        status: "stale",
        reportedStatus: snapshot.status,
        monitorStatus: missingRequiredRuntime ? "warning" : monitorStatus,
        reason: `The latest business run is ${Math.round(runAgeHours)} hours old; current operation is not proven.`,
        snapshotAgeHours,
        runAgeHours,
      };
    }

    return {
      status: snapshot.status,
      reportedStatus: snapshot.status,
      monitorStatus: missingRequiredRuntime ? "warning" : monitorStatus,
      reason: snapshot.proofSummary ?? snapshot.lastProof ?? "Fresh graph snapshot received.",
      snapshotAgeHours,
      runAgeHours,
    };
  }

  if (localStatus) {
    return {
      status: localStatus,
      reportedStatus: null,
      monitorStatus,
      reason: "Using current local proof because no published snapshot is available.",
      snapshotAgeHours: null,
      runAgeHours: null,
    };
  }

  return {
    status: "unknown",
    reportedStatus: null,
    monitorStatus: missingRequiredRuntime ? "warning" : monitorStatus,
    reason:
      runtimeSignals.length > 0
        ? "The scheduler is visible, but no current business-result proof has been published."
        : "No current runtime or business-result proof is connected to this loop.",
    snapshotAgeHours: null,
    runAgeHours: null,
  };
}
