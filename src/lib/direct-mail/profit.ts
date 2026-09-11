import type { WeeklyReview } from "./weekly";
import { invoicePricing, projectedCost } from "./pricing";
export type JobLink = NonNullable<WeeklyReview["jobLinks"]>[number];
export interface ProfitRow {
  jnid: string;
  number: string;
  name: string;
  status_name: string;
  updated_at: string | Date | null;
  revenue_for_gp: string | number | null;
  total_known_cost: string | number | null;
  is_final_gp_ready: boolean | null;
  gp_blockers: string[] | null;
  cost_status: string | null;
  supplier_material_cost: string | number | null;
  finalized_work_order_cost: string | number | null;
  subcontractor_invoice_cost: string | number | null;
  retail_misc_cost: string | number | null;
  permit_cost: string | number | null;
  completion_observed_at: string | Date | null;
}
export interface JobProfit extends JobLink {
  number: string;
  name: string;
  status: string;
  revenue: number | null;
  knownCost: number | null;
  grossProfit: number | null;
  finalProfit: number | null;
  margin: number | null;
  state: "Reconciled" | "Provisional" | "No invoiced revenue" | "Unavailable";
  blockers: string[];
  updatedAt: string | null;
  completionMonth: string | null;
  materials: number | null;
  labor: number | null;
  subcontractors: number | null;
  retail: number | null;
  permits: number | null;
}
const labels: Record<string, string> = {
  invoice_not_final_paid: "Invoices are not final and fully paid",
  non_final_work_orders: "Work orders still need final costs",
  supplier_invoices_need_review: "Supplier invoices need review",
  missing_major_material_invoice: "Major material invoice may be missing",
  permit_costs_need_review: "Permit costs need review",
  no_costs: "No job costs recorded",
  missing_materials: "Material costs missing",
  missing_labor: "Labor costs missing",
  labor_not_finalized: "Labor costs not finalized",
  partial_labor: "Only part of labor is finalized",
};
export const roundMoney = (v: number) =>
  Math.round((v + Number.EPSILON) * 100) / 100;
const value = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? null
    : roundMoney(Number(v));
const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);
export function mapJobProfit(link: JobLink, row?: ProfitRow): JobProfit {
  const revenue = value(row?.revenue_for_gp),
    knownCost = value(row?.total_known_cost);
  const grossProfit =
    revenue === null || knownCost === null
      ? null
      : roundMoney(revenue - knownCost);
  const blockers = [...(row?.gp_blockers ?? [])];
  if (revenue !== null && revenue > 0 && row?.cost_status !== "complete")
    blockers.push(row?.cost_status || "Cost completeness is unverified");
  const reconciled =
    !!row?.is_final_gp_ready &&
    revenue !== null &&
    revenue > 0 &&
    grossProfit !== null &&
    blockers.length === 0 &&
    row?.cost_status === "complete";
  return {
    ...link,
    number: row?.number ?? "",
    name: row?.name ?? "Job unavailable",
    status: row?.status_name ?? "Unavailable",
    revenue,
    knownCost,
    grossProfit,
    finalProfit: reconciled ? grossProfit : null,
    margin:
      revenue !== null && revenue > 0 && grossProfit !== null
        ? Math.round((grossProfit / revenue) * 1000) / 10
        : null,
    state:
      grossProfit === null
        ? "Unavailable"
        : revenue === 0
          ? "No invoiced revenue"
          : reconciled
            ? "Reconciled"
            : "Provisional",
    blockers: [...new Set(blockers)].map(
      (b) => labels[b] ?? b.replaceAll("_", " "),
    ),
    updatedAt: iso(row?.updated_at ?? null),
    completionMonth: row?.completion_observed_at
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Chicago",
          year: "numeric",
          month: "2-digit",
        })
          .format(new Date(row.completion_observed_at))
          .replace(/^(\d{2})\/(\d{4})$/, "$2-$1")
      : null,
    materials: value(row?.supplier_material_cost),
    labor: value(row?.finalized_work_order_cost),
    subcontractors: value(row?.subcontractor_invoice_cost),
    retail: value(row?.retail_misc_cost),
    permits: value(row?.permit_cost),
  };
}
export function profitTotals(jobs: JobProfit[]) {
  const unique = [...new Map(jobs.map((j) => [j.jobId, j])).values()];
  const known = unique.filter((j) => j.grossProfit !== null);
  const reconciled = unique.filter((j) => j.finalProfit !== null);
  return {
    jobs: unique.length,
    invoicedJobs: unique.filter((j) => (j.revenue ?? 0) > 0).length,
    revenue: unique.every((j) => j.revenue !== null)
      ? roundMoney(unique.reduce((s, j) => s + j.revenue!, 0))
      : null,
    knownCost:
      known.length === unique.length
        ? roundMoney(known.reduce((s, j) => s + j.knownCost!, 0))
        : null,
    grossProfit:
      known.length === unique.length
        ? roundMoney(known.reduce((s, j) => s + j.grossProfit!, 0))
        : null,
    finalProfit: reconciled.length
      ? roundMoney(reconciled.reduce((s, j) => s + j.finalProfit!, 0))
      : null,
    reconciledJobs: reconciled.length,
    provisionalJobs: unique.filter((j) => j.state === "Provisional").length,
    unavailableJobs: unique.length - known.length,
  };
}
export function campaignProfit(
  d: WeeklyReview,
  jobs: JobProfit[],
  campaignId: string,
) {
  const campaign = d.campaigns.find((c) => c.id === campaignId)!;
  const linked = jobs.filter((j) => j.campaignId === campaignId);
  const totals = profitTotals(linked);
  const estimatedMailCost = projectedCost(
    campaign.requested,
    invoicePricing(d.invoices).rate,
  );
  return {
    ...totals,
    linked,
    estimatedMailCost,
    estimatedContribution:
      totals.grossProfit === null || estimatedMailCost === null
        ? null
        : roundMoney(totals.grossProfit - estimatedMailCost),
  };
}
export interface ProfitResponse {
  available: true;
  reviewId: string;
  fetchedAt: string;
  jobs: JobProfit[];
}
