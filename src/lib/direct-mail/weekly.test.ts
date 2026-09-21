import { describe, it, expect } from "vitest";
import { weeklySchema, reviewIsStale } from "./weekly";
import { weeklyFixture } from "./weekly-fixture";
describe("aggregate weekly review contract", () => {
  it("preserves archived totals and unknown return/cost evidence", () => {
    const d = weeklySchema.parse(weeklyFixture());
    expect(d.summary.leads).toBe(2);
    expect(d.summary.archived).toBe(1);
    expect(d.summary.roas).toBeNull();
    expect(d.summary.confirmedMailed).toBeNull();
  });
  it("rejects an accidental financial double count", () => {
    const d = weeklyFixture();
    d.summary.invoiced = 2000;
    expect(() => weeklySchema.parse(d)).toThrow("invoiced does not reconcile");
  });
  it("rejects duplicate invoice and mailing identifiers", () => {
    const d = weeklyFixture();
    d.invoices.push({ ...d.invoices[0] });
    expect(() => weeklySchema.parse(d)).toThrow();
  });
  it("accepts invoice revenue separately from cash and rejects conflicting invoice evidence", () => {
    const d = weeklyFixture();
    d.jobLinks = [
      { jobId: "testjob123456", leadMonth: "2026-09", campaignId: "test-campaign", linkage: "single_prior_list_address_match" },
      { jobId: "otherjob123456", leadMonth: "2026-09", campaignId: null, linkage: "no_exact_prior_list_match" },
    ];
    d.invoiceReview = {
      verifiedAt: d.generatedAt,
      jobs: [
        { jobId: "testjob123456", invoiced: 1000 },
        { jobId: "otherjob123456", invoiced: 0 },
      ],
      note: "Synthetic billed-revenue fixture; not payment evidence.",
    };
    d.cashReview = {
      verifiedAt: d.generatedAt,
      jobs: [
        { jobId: "testjob123456", applied: 0, unapplied: 0 },
        { jobId: "otherjob123456", applied: 0, unapplied: 0 },
      ],
      months: [],
      note: "Synthetic cash snapshot",
    };
    expect(weeklySchema.parse(d).invoiceReview?.jobs[0].invoiced).toBe(1000);
    d.invoiceReview!.jobs[0].invoiced = 999;
    expect(() => weeklySchema.parse(d)).toThrow("Invoice review does not reconcile");
  });
  it("rejects private fields and unexpected source links", () => {
    const d = weeklyFixture();
    expect(() =>
      weeklySchema.parse({ ...d, leads: [{ name: "Private homeowner" }] }),
    ).toThrow();
    expect(() =>
      weeklySchema.parse({
        ...d,
        campaigns: [{ ...d.campaigns[0], address: "Private address" }],
      }),
    ).toThrow();
    d.campaigns[0].evidence = "https://untrusted.example/";
    expect(() => weeklySchema.parse(d)).toThrow();
  });
  it("uses Chicago calendar days for stale reviews", () => {
    expect(reviewIsStale("2026-09-11", new Date("2026-09-19T04:59:00Z"))).toBe(
      false,
    );
    expect(reviewIsStale("2026-09-11", new Date("2026-09-19T05:00:00Z"))).toBe(
      true,
    );
  });
});
