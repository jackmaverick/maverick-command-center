import type { WeeklyReview } from "./weekly";
type Invoice = WeeklyReview["invoices"][number];
/** Invoice-weighted cost, independent of payment date. Each physical piece is counted once. */
export function invoicePricing(invoices: Invoice[], basis = "all") {
  const ordered = [...invoices].sort(
    (a, b) =>
      b.invoiceDate.localeCompare(a.invoiceDate) ||
      b.number.localeCompare(a.number),
  );
  const selected = basis === "latest" ? ordered.slice(0, 1) : ordered;
  const total = selected.reduce((sum, i) => sum + i.amount, 0);
  const pieces = selected.reduce((sum, i) => sum + i.pieces, 0);
  return {
    total,
    pieces,
    invoiceCount: selected.length,
    rate:
      pieces > 0 && selected.every((i) => i.pieces > 0) ? total / pieces : null,
    latest: ordered[0] ?? null,
  };
}
export function projectedCost(quantity: number | null, rate: number | null) {
  return quantity === null ||
    rate === null ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0
    ? null
    : Math.round(quantity * rate * 100) / 100;
}
