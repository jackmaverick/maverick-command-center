"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Funnel, ReceiptText, Target, WalletCards } from "lucide-react";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/dates";

interface MetaAdsData {
  period: { key: string; label: string; start: string; end: string };
  meta: { spend: number; impressions: number; clicks: number; linkClicks: number; websiteLeads: number; costPerLead: number | null; ctr: number | null; campaigns: { id: string | null; name: string; spend: number; websiteLeads: number; costPerLead: number | null; linkClicks: number }[] };
  funnel: { crmLeads: number; appointmentsSet: number; appointmentsRan: number; estimatesSent: number; approvedEstimates: number; confirmedSigned: number; invoiceJobs: number; invoicedRevenue: number; materialCoveredInvoiceJobs: number; profitCoverageComplete: boolean };
  costs: { paidAgencySpend: number; allInPaidSpend: number; managementFeeRate: number; expectedManagementFee: number; billedManagementFee: number; estimatedUnbilledManagementFee: number; estimatedAppointmentFee: number | null; unbilledVerifiedAppointmentFees: number; estimatedAdditionalAgencyCost: number; expectedAllInSpend: number; agencyBookings: number; agencyBookingGap: number; events: { cost_type: string; amount: number; paid_at: string | null; service_start: string | null; service_end: string | null; bookingCount: number; invoice_number: string | null; receipt_number: string | null; notes: string | null }[] };
  attribution: { sourceName: string; unmatchedMetaLeads: number; crmMatchRate: number | null; allInRevenueMultiple: number | null; costPerAllInMetaLead: number | null; costPerAllInCrmLead: number | null; costPerAllInEstimate: number | null; costPerMaterialOnlyProfit: number | null };
  sync: { completed_at: string | null; status: string; window_start: string; window_end: string } | null;
}

function rate(numerator: number, denominator: number): string { return denominator > 0 ? formatPercent((numerator / denominator) * 100) : "—"; }
function money(value: number | null): string { return value === null ? "—" : formatCurrency(value); }
function preciseMoney(value: number): string { return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }); }

function Card({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Target }) {
  return <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><div className="mb-3 flex items-center justify-between text-[#8b949e]"><span className="text-xs font-medium uppercase tracking-wide">{label}</span><Icon className="h-4 w-4" /></div><p className="text-2xl font-bold text-[#e6edf3]">{value}</p><p className="mt-1 text-xs text-[#8b949e]">{detail}</p></div>;
}

function Loading() { return <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 bg-[#21262d]" />)}</div>; }

export default function MetaAdsPage() {
  const [period, setPeriod] = useState("all");
  const { data, isLoading, error } = useQuery<MetaAdsData>({
    queryKey: ["meta-ads", period],
    queryFn: async () => {
      const response = await fetch(`/api/meta-ads?period=${period}`);
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Failed to load Meta analytics"); }
      return response.json();
    },
  });

  const stages = data ? [
    { label: "CRM-attributed leads", value: data.funnel.crmLeads, denominator: data.meta.websiteLeads, detail: `of ${data.meta.websiteLeads} canonical Meta website leads` },
    { label: "Appointments set", value: data.funnel.appointmentsSet, denominator: data.funnel.crmLeads, detail: "JobNimbus status-history evidence" },
    { label: "Appointments ran", value: data.funnel.appointmentsRan, denominator: data.funnel.appointmentsSet, detail: "JobNimbus status-history evidence" },
    { label: "Estimates sent", value: data.funnel.estimatesSent, denominator: data.funnel.appointmentsRan, detail: "Estimate record status / signature evidence" },
    { label: "Approved estimates", value: data.funnel.approvedEstimates, denominator: data.funnel.estimatesSent, detail: "Approved or signature evidence" },
    { label: "Confirmed signatures", value: data.funnel.confirmedSigned, denominator: data.funnel.approvedEstimates, detail: "e-sign or signed date present" },
  ] : [];

  return <div>
    <div className="mb-8 flex items-start justify-between gap-4"><div><h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">Meta Ads &amp; Roof Ignite</h1><p className="max-w-3xl text-[#8b949e]">Actual Meta media spend, paid agency costs, and the Roof Ignite CRM funnel. Cash amounts are ledger-backed; future obligations are explicitly labelled estimates.</p></div><PeriodSelector value={period} onChange={setPeriod} /></div>

    {isLoading && <Loading />}
    {error && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-amber-200"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-5 w-5" />{error.message}</div><p className="mt-2 text-sm text-amber-100/80">The page needs the Meta analytics and agency-cost ledger migrations before it can calculate all-in spend.</p></div>}
    {data && <>
      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Card label="All-in cash paid" value={money(data.costs.allInPaidSpend)} detail="Meta media + paid Roof Ignite costs" icon={WalletCards} />
        <Card label="Meta media spend" value={money(data.meta.spend)} detail={`${data.meta.linkClicks.toLocaleString()} link clicks · ${data.meta.ctr === null ? "—" : formatPercent(data.meta.ctr)} CTR`} icon={CircleDollarSign} />
        <Card label="Agency cash paid" value={money(data.costs.paidAgencySpend)} detail="Receipts and paid invoices only" icon={ReceiptText} />
        <Card label="All-in revenue multiple" value={data.attribution.allInRevenueMultiple === null ? "—" : `${data.attribution.allInRevenueMultiple.toFixed(2)}×`} detail={data.funnel.invoiceJobs ? `${money(data.funnel.invoicedRevenue)} invoiced revenue` : "No eligible invoices in cohort"} icon={Target} />
        <Card label="Cost per profit" value={data.attribution.costPerMaterialOnlyProfit === null ? "Unavailable" : money(data.attribution.costPerMaterialOnlyProfit)} detail={data.funnel.profitCoverageComplete ? "Material-only contribution; excludes labor" : `Material coverage: ${data.funnel.materialCoveredInvoiceJobs}/${data.funnel.invoiceJobs} invoice jobs`} icon={Funnel} />
      </div>

      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5"><p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">All-in lead economics</p><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-[#8b949e]">Per Meta lead</dt><dd className="font-semibold text-[#e6edf3]">{money(data.attribution.costPerAllInMetaLead)}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#8b949e]">Per CRM-attributed lead</dt><dd className="font-semibold text-[#e6edf3]">{money(data.attribution.costPerAllInCrmLead)}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#8b949e]">Per estimate sent</dt><dd className="font-semibold text-[#e6edf3]">{money(data.attribution.costPerAllInEstimate)}</dd></div></dl></div>
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5"><p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">Projected unbilled agency cost</p><p className="mt-3 text-3xl font-bold text-[#e6edf3]">{money(data.costs.estimatedAdditionalAgencyCost)}</p><p className="mt-2 text-sm text-[#8b949e]">{money(data.costs.estimatedUnbilledManagementFee)} remaining at {(data.costs.managementFeeRate * 100).toFixed(0)}% media management; {money(data.costs.unbilledVerifiedAppointmentFees)} from CRM appointments not already billed.</p><p className="mt-3 text-xs text-[#8b949e]">Cash paid plus this estimate: {money(data.costs.expectedAllInSpend)}. Invoice-backed cash remains the primary metric.</p></div>
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5"><p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">Agency booking reconciliation</p><div className="mt-3 flex items-end gap-5"><div><p className="text-3xl font-bold text-[#e6edf3]">{data.costs.agencyBookings}</p><p className="text-xs text-[#8b949e]">agency-billed bookings</p></div><div><p className="text-3xl font-bold text-[#e6edf3]">{data.funnel.appointmentsSet}</p><p className="text-xs text-[#8b949e]">CRM appointments set</p></div></div><p className={`mt-3 text-sm ${data.costs.agencyBookingGap === 0 ? "text-green-300" : "text-amber-200"}`}>{data.costs.agencyBookingGap === 0 ? "The two sources reconcile." : `${Math.abs(data.costs.agencyBookingGap)} booking(s) need attribution or stage-history reconciliation.`}</p></div>
      </section>

      <section className="mb-8 rounded-lg border border-[#30363d] bg-[#161b22]"><div className="border-b border-[#30363d] px-5 py-4"><h2 className="font-semibold text-[#e6edf3]">Roof Ignite conversion funnel</h2><p className="mt-1 text-sm text-[#8b949e]">Every CRM stage is counted from the same source-qualified lead cohort. The page does not infer sales stages from Meta events.</p></div><div className="grid divide-y divide-[#30363d] md:grid-cols-3 md:divide-x md:divide-y-0">{stages.map((stage) => <div key={stage.label} className="p-5"><p className="text-sm text-[#8b949e]">{stage.label}</p><p className="mt-1 text-3xl font-bold text-[#e6edf3]">{stage.value}</p><p className="mt-2 text-sm text-[#58a6ff]">{rate(stage.value, stage.denominator)} conversion</p><p className="mt-1 text-xs text-[#8b949e]">{stage.detail}</p></div>)}</div></section>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-5"><div className="flex items-center gap-2 text-amber-200"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Attribution reconciliation</h2></div><p className="mt-3 text-sm text-[#d0d7de]">Meta reports <strong>{data.meta.websiteLeads}</strong> canonical website-lead events; JobNimbus has <strong>{data.funnel.crmLeads}</strong> jobs sourced as “{data.attribution.sourceName}”.</p><p className="mt-2 text-sm text-[#8b949e]">{data.attribution.unmatchedMetaLeads} Meta lead event(s) are not yet source-matched in the CRM. They are not treated as appointments, sales, or revenue.</p></div>
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5"><div className="flex items-center gap-2 text-[#e6edf3]"><CheckCircle2 className="h-5 w-5 text-green-400" /><h2 className="font-semibold">Data freshness</h2></div>{data.sync ? <p className="mt-3 text-sm text-[#8b949e]">Latest successful Meta ledger run: <span className="text-[#e6edf3]">{data.sync.completed_at ? new Date(data.sync.completed_at).toLocaleString() : "in progress"}</span><br />Coverage: {data.sync.window_start} to {data.sync.window_end}</p> : <p className="mt-3 text-sm text-[#8b949e]">No successful ledger run is recorded yet.</p>}<p className="mt-3 text-xs text-[#8b949e]">Agency records are dated by payment for cash reporting; the service window remains visible in the ledger.</p></div>
      </section>

      <section className="mb-8 overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22]"><div className="border-b border-[#30363d] px-5 py-4"><h2 className="font-semibold text-[#e6edf3]">Paid Roof Ignite cost ledger</h2><p className="mt-1 text-sm text-[#8b949e]">Exact paid amounts from receipts and invoices—not a derived Meta-only estimate.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#0d1117] text-xs uppercase tracking-wide text-[#8b949e]"><tr><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Evidence</th><th className="px-5 py-3 text-right">Bookings</th><th className="px-5 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-[#30363d]">{data.costs.events.map((event, index) => <tr key={`${event.invoice_number || event.receipt_number || event.cost_type}-${index}`} className="text-[#d0d7de]"><td className="px-5 py-3">{event.paid_at || "—"}</td><td className="px-5 py-3">{event.cost_type.replaceAll("_", " ")}</td><td className="max-w-xl px-5 py-3 text-[#8b949e]">{event.invoice_number ? `Invoice ${event.invoice_number}` : `Receipt ${event.receipt_number || "—"}`}{event.service_start && event.service_end ? ` · service ${event.service_start}–${event.service_end}` : ""}</td><td className="px-5 py-3 text-right">{event.bookingCount || "—"}</td><td className="px-5 py-3 text-right font-medium">{preciseMoney(event.amount)}</td></tr>)}{data.costs.events.length === 0 && <tr><td className="px-5 py-5 text-[#8b949e]" colSpan={5}>No paid agency events fall inside this reporting window.</td></tr>}</tbody></table></div></section>

      <section className="overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22]"><div className="border-b border-[#30363d] px-5 py-4"><h2 className="font-semibold text-[#e6edf3]">Campaign delivery</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#0d1117] text-xs uppercase tracking-wide text-[#8b949e]"><tr><th className="px-5 py-3">Campaign</th><th className="px-5 py-3 text-right">Spend</th><th className="px-5 py-3 text-right">Leads</th><th className="px-5 py-3 text-right">CPL</th><th className="px-5 py-3 text-right">Link clicks</th></tr></thead><tbody className="divide-y divide-[#30363d]">{data.meta.campaigns.map((campaign) => <tr key={campaign.id || campaign.name} className="text-[#d0d7de]"><td className="max-w-md px-5 py-3">{campaign.name}</td><td className="px-5 py-3 text-right">{money(campaign.spend)}</td><td className="px-5 py-3 text-right">{campaign.websiteLeads}</td><td className="px-5 py-3 text-right">{money(campaign.costPerLead)}</td><td className="px-5 py-3 text-right">{campaign.linkClicks.toLocaleString()}</td></tr>)}</tbody></table></div></section>
    </>}
  </div>;
}
