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

export function campaignMix(input: {
  target: number | null;
  largeDrops: number | null;
  largePieces: number | null;
  automatedDrops: number | null;
  automatedPieces: number | null;
  historicalAverage: number | null;
  invoiceRate: number | null;
  allInRate: number | null;
}) {
  const counts = [
    input.target,
    input.largeDrops,
    input.largePieces,
    input.automatedDrops,
    input.automatedPieces,
  ];
  if (
    counts.some(
      (value) =>
        value === null ||
        !Number.isSafeInteger(value) ||
        value < 0,
    )
  )
    return null;

  const pieces =
    input.largeDrops! * input.largePieces! +
    input.automatedDrops! * input.automatedPieces!;
  if (!Number.isSafeInteger(pieces)) return null;

  return {
    pieces,
    gap: input.target! - pieces,
    campaigns: input.largeDrops! + input.automatedDrops!,
    historicalBatches:
      input.historicalAverage !== null && input.historicalAverage > 0
        ? Math.ceil(input.target! / input.historicalAverage)
        : null,
    invoiceCost: projectedCost(pieces, input.invoiceRate),
    allInCost: projectedCost(pieces, input.allInRate),
  };
}
