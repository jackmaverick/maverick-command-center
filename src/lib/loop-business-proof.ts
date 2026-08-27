import type { LoopHealthEvaluation } from "@/lib/loop-health-evaluation";
import type { LoopHealthSnapshot } from "@/lib/loop-health-snapshots";

export const GAF_MEASUREMENT_LOOP_ID = "gaf_measurements_to_jobnimbus";
export const GAF_MEASUREMENT_CONTRACT_VERSION =
  "gaf_measurements_to_jobnimbus.v1";

const REQUIRED_COUNTS = [
  "discovered",
  "eligible",
  "applied_verified",
  "nothing_to_change_verified",
  "blocked_source",
  "blocked_conflict",
  "browser_failed",
  "writes",
  "verified_readbacks",
] as const;

type RequiredCount = (typeof REQUIRED_COUNTS)[number];
type GafCounts = Record<RequiredCount, number>;

function readCounts(snapshot: LoopHealthSnapshot): GafCounts | null {
  const raw = snapshot.details.counts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const entries = REQUIRED_COUNTS.map(
    (key) => [key, (raw as Record<string, unknown>)[key]] as const,
  );
  if (
    entries.some(
      ([, value]) =>
        typeof value !== "number" || !Number.isInteger(value) || value < 0,
    )
  ) {
    return null;
  }
  return Object.fromEntries(entries) as GafCounts;
}

export function enforceBusinessProofContract({
  loopId,
  snapshot,
  evaluation,
}: {
  loopId: string;
  snapshot: LoopHealthSnapshot | null;
  evaluation: LoopHealthEvaluation;
}): LoopHealthEvaluation {
  if (
    loopId !== GAF_MEASUREMENT_LOOP_ID ||
    !snapshot ||
    evaluation.status !== "healthy"
  ) {
    return evaluation;
  }

  const counts = readCounts(snapshot);
  const contractVersion = snapshot.details.contract_version;
  const outcome = snapshot.details.outcome;
  const sourceProvenance = snapshot.details.source_provenance;
  if (
    contractVersion !== GAF_MEASUREMENT_CONTRACT_VERSION ||
    !counts ||
    sourceProvenance !== "verified_attached_report"
  ) {
    return {
      ...evaluation,
      status: "unknown",
      reason:
        "The runner reported healthy, but the GAF v1 count contract and verified attached-report provenance were not published.",
    };
  }

  if (
    counts.browser_failed > 0 ||
    counts.writes !== counts.verified_readbacks
  ) {
    return {
      ...evaluation,
      status: "failing",
      reason:
        counts.browser_failed > 0
          ? `${counts.browser_failed} authenticated JobNimbus browser operation(s) failed.`
          : `${counts.writes} write(s) were reported but only ${counts.verified_readbacks} fresh readback(s) were verified.`,
    };
  }

  if (counts.blocked_source > 0 || counts.blocked_conflict > 0) {
    return {
      ...evaluation,
      status: "warning",
      reason: `${counts.blocked_source} source-provenance blocker(s) and ${counts.blocked_conflict} conflict blocker(s) need review.`,
    };
  }

  const verifiedMutation =
    outcome === "applied_verified" &&
    counts.applied_verified > 0 &&
    counts.writes > 0 &&
    counts.applied_verified === counts.writes &&
    counts.verified_readbacks === counts.writes;
  const verifiedNoop =
    outcome === "nothing_to_change_verified" &&
    counts.nothing_to_change_verified > 0 &&
    counts.writes === 0 &&
    counts.verified_readbacks === 0;

  if (!verifiedMutation && !verifiedNoop) {
    return {
      ...evaluation,
      status: "unknown",
      reason:
        "The daily run is fresh, but it did not prove a verified JobNimbus mutation/readback or a verified zero-work outcome.",
    };
  }

  return {
    ...evaluation,
    reason: verifiedMutation
      ? `${counts.applied_verified} GAF measurement row(s) were written and independently read back from JobNimbus.`
      : `${counts.nothing_to_change_verified} eligible item(s) were verified as already current; no JobNimbus write was needed.`,
  };
}
