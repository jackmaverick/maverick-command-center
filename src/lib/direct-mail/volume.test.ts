import { describe, expect, it } from "vitest";
import { weeklyFixture } from "./weekly-fixture";
import { monthlyMailVolume } from "./volume";

describe("monthly mail volume", () => {
  it("uses confirmed mailed pieces before provider production evidence", () => {
    const d = weeklyFixture();
    d.campaigns[0].confirmedMailed = 97;
    expect(monthlyMailVolume(d)[0]).toMatchObject({
      requested: 100,
      documentedPieces: 97,
      evidence: "Confirmed mailed",
      packages: 1,
      averageRequest: 100,
    });
  });

  it("uses invoiced physical pieces when postal confirmation is incomplete", () => {
    const d = weeklyFixture();
    expect(monthlyMailVolume(d)[0]).toMatchObject({
      documentedPieces: 100,
      evidence: "Vendor invoice",
    });
  });

  it("falls back to postal-statement pieces and leaves missing proof pending", () => {
    const d = weeklyFixture();
    d.invoices = [];
    expect(monthlyMailVolume(d)[0]).toMatchObject({
      documentedPieces: null,
      evidence: "Pending",
    });
    d.costReview = {
      reviewedAt: d.generatedAt,
      invoiceStamps: [],
      allocations: [
        {
          campaignId: d.campaigns[0].id,
          invoiceNumber: null,
          vendorCost: null,
          method: "pending",
          postal: {
            documentId: "synthetic-postal-statement",
            pieces: 98,
            total: 34,
            net: 24,
            stamps: "outside_vendor",
            evidence: "https://mail.google.com/mail/#all/abc123",
          },
          gaps: ["Vendor invoice pending"],
          note: "Synthetic postal evidence",
        },
      ],
    };
    expect(monthlyMailVolume(d)[0]).toMatchObject({
      documentedPieces: 98,
      evidence: "Postal statement",
    });
  });
});
