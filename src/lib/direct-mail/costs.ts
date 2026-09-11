import type { WeeklyReview } from "./weekly";

export type CostAllocation = NonNullable<WeeklyReview["costReview"]>["allocations"][number];
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function allocationCost(a: CostAllocation) {
  // Net USPS due excludes affixed stamps. Add full postage only when stamps
  // are outside the received vendor invoice; unresolved overlap stays partial.
  const postage = a.postal ? a.postal.stamps === "outside_vendor" ? a.postal.total : a.postal.net : null;
  const known = a.vendorCost !== null || postage !== null
    ? round((a.vendorCost ?? 0) + (postage ?? 0)) : null;
  const complete = a.vendorCost !== null && postage !== null && a.postal?.stamps !== "unresolved" && !a.gaps.length;
  return { postage, known, complete, label: complete ? a.method === "exact" ? "Invoice + postage" : "Allocated invoice + postage" : "Partial cost" };
}
export function mailingCosts(d: WeeklyReview, campaignIds?: string[]) {
  const selected = d.costReview?.allocations.filter(a => !campaignIds || campaignIds.includes(a.campaignId));
  if (!selected) return { known: null, vendor: null, postage: null, complete: false, covered: 0, count: campaignIds?.length ?? d.campaigns.length };
  const costs = selected.map(allocationCost);
  return {
    known: costs.some(c => c.known !== null) ? round(costs.reduce((s, c) => s + (c.known ?? 0), 0)) : null,
    vendor: round(selected.reduce((s, a) => s + (a.vendorCost ?? 0), 0)),
    postage: round(costs.reduce((s, c) => s + (c.postage ?? 0), 0)),
    complete: selected.length > 0 && costs.every(c => c.complete),
    covered: costs.filter(c => c.complete).length,
    count: selected.length,
  };
}
export function returnMetrics(revenue: number | null, grossProfit: number | null, spend: number | null) {
  const valid = spend !== null && spend > 0;
  return { roas: valid && revenue !== null ? revenue / spend : null,
    roi: valid && grossProfit !== null ? (grossProfit - spend) / spend : null,
    contribution: spend !== null && grossProfit !== null ? round(grossProfit - spend) : null };
}
export function allInProjection(d: WeeklyReview, basis = "all") {
  if (!d.costReview) return null;
  const invoices = basis === "latest" ? [...d.invoices].sort((a,b) => b.invoiceDate.localeCompare(a.invoiceDate)).slice(0,1) : d.invoices;
  const pieces = invoices.reduce((s,i) => s+i.pieces,0);
  if (!pieces || invoices.some(i => !i.pieces)) return null;
  const service = invoices.reduce((s,i) => s+i.amount-(d.costReview!.invoiceStamps.find(x => x.number===i.number)?.amount ?? 0),0)/pieces;
  // Use current review month's postal statements (or latest observed month),
  // preserving historical service mix and avoiding the older postage rate.
  const postal = d.costReview.allocations.filter(a => a.postal);
  const latest = postal.map(a => d.campaigns.find(c => c.id===a.campaignId)!.requestedDate.slice(0,7)).sort().at(-1);
  const current = postal.filter(a => d.campaigns.find(c => c.id===a.campaignId)!.requestedDate.startsWith(latest!));
  const postalPieces = current.reduce((s,a) => s+a.postal!.pieces,0);
  return postalPieces ? service + current.reduce((s,a) => s+a.postal!.total,0)/postalPieces : null;
}
