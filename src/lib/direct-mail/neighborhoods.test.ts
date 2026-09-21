import { describe, it, expect } from "vitest";
import { neighborhoodIsStale, neighborhoodSchema } from "./neighborhoods";
import { weeklySchema } from "./weekly";
import { weeklyFixture } from "./weekly-fixture";
const interval = {
  n: 0,
  exact_n: 0,
  mean_days: null,
  median_days: null,
  min_days: null,
  max_days: null,
  confidence: "no_data",
};
const fixture = () => ({
  version: 1,
  ronPrepCalendarDays: 3,
  asOf: "2026-09-14T12:00:00Z",
  sourceHash: "a".repeat(64),
  opportunities: [],
  delivery: {
    request_to_seed: {
      ...interval,
      n: 2,
      exact_n: 2,
      mean_days: 12.5,
      median_days: 12.5,
      min_days: 12,
      max_days: 13,
      confidence: "small_sample",
    },
    request_to_postal: interval,
    postal_to_seed: interval,
  },
  profitExamples: [],
  graph: { nodeCount: 0, edgeCount: 0, relations: {} },
  changes: [],
});
describe("neighborhood evidence contract", () => {
  it("preserves old weekly payloads and adds the optional neighborhood view", () => {
    const before = weeklyFixture();
    expect(weeklySchema.parse(before).neighborhoodReview).toBeUndefined();
    const after = weeklySchema.parse({
      ...before,
      neighborhoodReview: fixture(),
    });
    expect(after.summary).toEqual(weeklySchema.parse(before).summary);
    expect(after.neighborhoodReview?.delivery.request_to_seed.mean_days).toBe(
      12.5,
    );
    expect(
      after.neighborhoodReview?.delivery.postal_to_seed.mean_days,
    ).toBeNull();
  });
  it("rejects private fields and future/stale evidence stays visibly stale", () => {
    expect(() =>
      neighborhoodSchema.parse({
        ...fixture(),
        recipients: [{ address: "private" }],
      }),
    ).toThrow();
    expect(
      neighborhoodIsStale(
        "2026-09-14T12:00:00Z",
        Date.parse("2026-09-15T12:00:01Z"),
      ),
    ).toBe(true);
    expect(
      neighborhoodIsStale(
        "2026-09-15T12:00:00Z",
        Date.parse("2026-09-14T12:00:00Z"),
      ),
    ).toBe(true);
    expect(
      neighborhoodIsStale(
        "2026-09-14T12:00:00Z",
        Date.parse("2026-09-14T18:00:00Z"),
      ),
    ).toBe(false);
  });
  it("retains hash-only reviewed audiences and rejects conflicting identities", () => {
    const audience = {
      id: "audience:example",
      anchorJobId: "job123456789",
      neighborhood: "Example Hills",
      eligibleCount: 12,
      preparationStage: "candidate_list_prepared_for_review" as const,
      sourceSha256: "a".repeat(64),
      suppressionAuditSha256: "b".repeat(64),
      eligibleCsvSha256: "c".repeat(64),
      sourceSnapshotHash: "d".repeat(64),
      freshness: "preserved_prior_review" as const,
    };
    const parsed = neighborhoodSchema.parse({ ...fixture(), reviewedAudiences: [audience] });
    expect(parsed.reviewedAudiences).toEqual([audience]);
    expect(() => neighborhoodSchema.parse({
      ...fixture(), reviewedAudiences: [audience, { ...audience, freshness: "current_source" }],
    })).toThrow("Duplicate reviewed audience identity");
    expect(() => neighborhoodSchema.parse({
      ...fixture(), reviewedAudiences: [{ ...audience, sourcePath: "/private/list.csv" }],
    })).toThrow();
  });
});
