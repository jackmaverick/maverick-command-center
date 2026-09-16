import type { WeeklyReview } from "./weekly";
import { invoicePricing, projectedCost } from "./pricing";
import { allocationCost, mailingCosts } from "./costs";
export function encodeCsv(
  headers: string[],
  rows: (string | number | null)[][],
) {
  const escape = (v: string | number | null) => {
    const s = v === null ? "Unknown" : String(v);
    return (
      '"' +
      (typeof v === "string" && /^[\s]*[=+@-]/.test(s) ? "'" : "") +
      s.replaceAll('"', '""') +
      '"'
    );
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")
  );
}
export function weeklyCsv(d: WeeklyReview, p: URLSearchParams) {
  switch (p.get("view")) {
    case "costs":
      return encodeCsv(["List", "Request date", "Invoice", "Vendor cost", "Allocation method", "Additional postage", "Documented subtotal", "Coverage", "Postal pieces", "Gaps", "Method", "Postal evidence"], (d.costReview?.allocations ?? []).map(a => {
        const c=d.campaigns.find(c=>c.id===a.campaignId)!; const cost=allocationCost(a);
        return [c.name,c.requestedDate,a.invoiceNumber,a.vendorCost,a.method,cost.postage,cost.known,cost.label,a.postal?.pieces??null,a.gaps.join("; "),a.note,a.postal?.evidence??null];
      }));
    case "monthly":
      return encodeCsv(
        [
          "Month",
          "Requested rows",
          "New leads",
          "Approved sales by lead month",
          "Approved invoices by lead month",
          "Ron invoices by service month",
          "Verified vendor payments",
          "Documented mailing costs by request month (partial where flagged)",
          "Cost coverage",
          "Customer cash applied by payment month",
          "Customer cash unapplied by payment month",
          "Invoiced pieces",
          "Average Ron invoice cost per piece",
        ],
        d.months
          .filter(
            (m) =>
              !p.get("month") ||
              p.get("month") === "all" ||
              m.month === p.get("month"),
          )
          .map((m) => [
            m.month,
            m.requested,
            m.leads,
            m.sales,
            m.invoiced,
            m.vendorCost,
            m.paid,
            mailingCosts(d,d.campaigns.filter(c=>c.requestedDate.startsWith(m.month)).map(c=>c.id)).known,
            mailingCosts(d,d.campaigns.filter(c=>c.requestedDate.startsWith(m.month)).map(c=>c.id)).complete ? "Vendor + postage covered" : "Partial",
            d.cashReview?.months.find(x=>x.month===m.month)?.applied ?? null,
            d.cashReview?.months.find(x=>x.month===m.month)?.unapplied ?? null,
            invoicePricing(d.invoices.filter((i) => i.serviceMonth === m.month))
              .pieces,
            invoicePricing(d.invoices.filter((i) => i.serviceMonth === m.month))
              .rate,
          ]),
      );
    case "lists": {
      const rows = d.campaigns.filter(
        (c) =>
          c.name.toLowerCase().includes((p.get("q") || "").toLowerCase()) &&
          (p.get("filter") === "revenue"
            ? c.invoiced > 0
            : p.get("filter") === "response"
              ? c.leads > 0
              : p.get("filter") === "due"
                ? c.reviewDate <= d.asOf
                : true),
      );
      const sort = p.get("sort");
      rows.sort((a, b) =>
        sort === "revenue"
          ? b.invoiced - a.invoiced
          : sort === "oldest"
            ? a.requestedDate.localeCompare(b.requestedDate)
            : sort === "newest"
              ? b.requestedDate.localeCompare(a.requestedDate)
              : b.leads - a.leads || b.invoiced - a.invoiced,
      );
      return encodeCsv(
        [
          "List",
          "Audience strategy",
          "Touch type",
          "Requested date",
          "Planned postal date",
          "Provisional review",
          "Requested rows",
          "Linked leads",
          "Linked invoiced",
          "Addresses with later requests",
        ],
        rows.map((c) => [
          c.name,
          c.audienceStrategy ?? "unclassified",
          c.touchType ?? "unclassified",
          c.requestedDate,
          c.plannedDate,
          c.reviewDate,
          c.requested,
          c.leads,
          c.invoiced,
          c.laterTouches,
        ]),
      );
    }
    case "actions":
      return encodeCsv(
        [
          "Priority",
          "Neighborhood",
          "Type",
          "Status",
          "Review due",
          "Roof date",
          "Proposed quantity",
          "Owner",
          "Next action",
          "Approval checks",
          "Projected Ron invoice cost",
          "Weighted Ron invoice cost per piece",
        ],
        d.actions
          .filter(
            (a) =>
              !p.get("lane") ||
              p.get("lane") === "All" ||
              a.lane === p.get("lane"),
          )
          .sort((a, b) => a.priority - b.priority)
          .map((a) => [
            a.priority,
            a.neighborhood,
            a.lane,
            a.status,
            a.due,
            a.install,
            a.proposedQuantity,
            a.owner,
            a.nextStep,
            a.gates.join("; "),
            projectedCost(a.proposedQuantity, invoicePricing(d.invoices).rate),
            invoicePricing(d.invoices).rate,
          ]),
      );
    default:
      throw new Error("Unknown export view");
  }
}
