import { describe, it, expect } from "vitest";
import { invoicePricing, projectedCost } from "./pricing";
import { weeklyFixture } from "./weekly-fixture";
import { weeklySchema } from "./weekly";
describe("invoice-based mailing budgets", () => {
  it("uses total cost divided by pieces rather than averaging invoice rates", () => {
    const i = weeklyFixture().invoices[0];
    const p = invoicePricing([
      { ...i, number: "a", amount: 100, pieces: 100 },
      { ...i, number: "b", amount: 900, pieces: 300 },
    ]);
    expect(p.rate).toBe(2.5);
    expect(projectedCost(500, p.rate)).toBe(1250);
  });
  it("includes committed invoices without payment evidence", () => {
    const d = weeklyFixture();
    d.invoices[0].paidDate = null;
    d.invoices[0].paymentEvidence = null;
    d.summary.knownPaid = 0;
    expect(weeklySchema.parse(d).invoices).toHaveLength(1);
    expect(invoicePricing(d.invoices).rate).toBe(0.5);
  });
  it("selects latest invoice by invoice date and leaves input unchanged", () => {
    const i = weeklyFixture().invoices[0];
    const rows = [
      { ...i, number: "a", invoiceDate: "2026-01-01", amount: 30, pieces: 100 },
      {
        ...i,
        number: "b",
        invoiceDate: "2026-07-31",
        amount: 1047.66,
        pieces: 1643,
      },
    ];
    expect(invoicePricing(rows, "latest").rate).toBeCloseTo(0.63765064);
    expect(rows[0].number).toBe("a");
  });
  it("does not invent a rate with absent quantities or invalid planned rows", () => {
    expect(invoicePricing([]).rate).toBeNull();
    expect(
      invoicePricing([{ ...weeklyFixture().invoices[0], pieces: 0 }]).rate,
    ).toBeNull();
    expect(projectedCost(null, 0.5)).toBeNull();
    expect(projectedCost(1.5, 0.5)).toBeNull();
    expect(projectedCost(0, 0.5)).toBe(0);
  });
});
