"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Database, Funnel, Target } from "lucide-react";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/dates";

interface MetaAdsData {
  period: { key: string; label: string; start: string; end: string };
  meta: {
    accountId: string; spend: number; impressions: number; clicks: number; linkClicks: number;
    landingPageViews: number; websiteLeads: number; costPerLead: number | null; ctr: number | null;
    campaigns: { id: string | null; name: string; spend: number; websiteLeads: number; costPerLead: number | null; impressions: number; linkClicks: number }[];
  };
  funnel: {
    crmLeads: number; appointmentsSet: number; appointmentsRan: number; estimatesSent: number;
    approvedEstimates: number; confirmedSigned: number; invoiceJobs: number; invoicedRevenue: number;
    materialCoveredInvoiceJobs: number; materialCost: number; profitCoverageComplete: boolean;
    materialOnlyGrossProfit: number | null;
  };
  attribution: {
    sourceName: string; unmatchedMetaLeads: number; crmMatchRate: number | null;
    revenueRoas: number | null; costPerMaterialOnlyProfit: number | null;
  };
  sync: { completed_at: string | null; status: string; window_start: string; window_end: string } | null;
}

function rate(numerator: number, denominator: number): string {
  return denominator > 0 ? formatPercent((numerator / denominator) * 100) : "—";
}

function metric(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value.toFixed(2)}${suffix}`;
}

function Card({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Target }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4">
      <div className="mb-3 flex items-center justify-between text-[#8b949e]">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-[#e6edf3]">{value}</p>
      <p className="mt-1 text-xs text-[#8b949e]">{detail}</p>
    </div>
  );
}

function Loading() {
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 bg-[#21262d]" />)}</div>;
}

export default function MetaAdsPage() {
  const [period, setPeriod] = useState("month");
  const { data, isLoading, error } = useQuery<MetaAdsData>({
    queryKey: ["meta-ads", period],
    queryFn: async () => {
      const response = await fetch(`/api/meta-ads?period=${period}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load Meta analytics");
      }
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

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">Meta Ads Funnel</h1>
          <p className="max-w-3xl text-[#8b949e]">Meta delivery paired with the Roof Ignite CRM cohort. Financial metrics are withheld when revenue attribution or cost coverage is incomplete.</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading && <Loading />}
      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-amber-200">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-5 w-5" />{error.message}</div>
          <p className="mt-2 text-sm text-amber-100/80">Apply the Meta analytics ledger migration, then run the read-only collector with explicit write mode. No campaign changes are required.</p>
        </div>
      )}
      {data && <>
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card label="Meta website leads" value={data.meta.websiteLeads.toLocaleString()} detail={`Canonical lead event · ${formatCurrency(data.meta.costPerLead ?? 0)} CPL`} icon={Target} />
          <Card label="Meta spend" value={formatCurrency(data.meta.spend)} detail={`${data.meta.linkClicks.toLocaleString()} link clicks · ${data.meta.ctr === null ? "—" : formatPercent(data.meta.ctr)} CTR`} icon={CircleDollarSign} />
          <Card label="CRM-attributed leads" value={data.funnel.crmLeads.toLocaleString()} detail={`${data.attribution.crmMatchRate === null ? "—" : formatPercent(data.attribution.crmMatchRate)} matched to Meta`} icon={Database} />
          <Card label="Invoice-based ROAS" value={metric(data.attribution.revenueRoas, "×")} detail={data.funnel.invoiceJobs ? `${formatCurrency(data.funnel.invoicedRevenue)} from ${data.funnel.invoiceJobs} invoiced job(s)` : "No eligible invoices in cohort"} icon={CircleDollarSign} />
          <Card label="Cost per profit" value={data.attribution.costPerMaterialOnlyProfit === null ? "Unavailable" : formatCurrency(data.attribution.costPerMaterialOnlyProfit)} detail={data.funnel.profitCoverageComplete ? "Material-only contribution; excludes labor/commission" : `Material cost coverage: ${data.funnel.materialCoveredInvoiceJobs}/${data.funnel.invoiceJobs} invoice jobs`} icon={Funnel} />
        </div>

        <section className="mb-8 rounded-lg border border-[#30363d] bg-[#161b22]">
          <div className="border-b border-[#30363d] px-5 py-4">
            <h2 className="font-semibold text-[#e6edf3]">Roof Ignite conversion funnel</h2>
            <p className="mt-1 text-sm text-[#8b949e]">Each CRM stage is counted from the same source-qualified lead cohort. A dash means its prior stage has no verified records.</p>
          </div>
          <div className="grid divide-y divide-[#30363d] md:grid-cols-3 md:divide-x md:divide-y-0">
            {stages.map((stage) => <div key={stage.label} className="p-5">
              <p className="text-sm text-[#8b949e]">{stage.label}</p>
              <p className="mt-1 text-3xl font-bold text-[#e6edf3]">{stage.value}</p>
              <p className="mt-2 text-sm text-[#58a6ff]">{rate(stage.value, stage.denominator)} conversion</p>
              <p className="mt-1 text-xs text-[#8b949e]">{stage.detail}</p>
            </div>)}
          </div>
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 text-amber-200"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Attribution reconciliation</h2></div>
            <p className="mt-3 text-sm text-[#d0d7de]">Meta reports <strong>{data.meta.websiteLeads}</strong> canonical website-lead events; JobNimbus has <strong>{data.funnel.crmLeads}</strong> jobs sourced as “{data.attribution.sourceName}”.</p>
            <p className="mt-2 text-sm text-[#8b949e]">{data.attribution.unmatchedMetaLeads} Meta lead event(s) are not yet source-matched in the CRM. The dashboard will not treat those as appointments, sales, or revenue.</p>
          </div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
            <div className="flex items-center gap-2 text-[#e6edf3]"><CheckCircle2 className="h-5 w-5 text-green-400" /><h2 className="font-semibold">Data freshness</h2></div>
            {data.sync ? <p className="mt-3 text-sm text-[#8b949e]">Latest successful ledger run: <span className="text-[#e6edf3]">{data.sync.completed_at ? new Date(data.sync.completed_at).toLocaleString() : "in progress"}</span><br />Coverage: {data.sync.window_start} to {data.sync.window_end}</p> : <p className="mt-3 text-sm text-[#8b949e]">No successful ledger run is recorded yet.</p>}
            <p className="mt-3 text-xs text-[#8b949e]">Meta uses only the canonical <code>lead</code> event; it does not add overlapping onsite-web-lead actions.</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22]">
          <div className="border-b border-[#30363d] px-5 py-4"><h2 className="font-semibold text-[#e6edf3]">Campaign delivery</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#0d1117] text-xs uppercase tracking-wide text-[#8b949e]"><tr><th className="px-5 py-3">Campaign</th><th className="px-5 py-3 text-right">Spend</th><th className="px-5 py-3 text-right">Leads</th><th className="px-5 py-3 text-right">CPL</th><th className="px-5 py-3 text-right">Link clicks</th></tr></thead><tbody className="divide-y divide-[#30363d]">{data.meta.campaigns.map((campaign) => <tr key={campaign.id || campaign.name} className="text-[#d0d7de]"><td className="max-w-md px-5 py-3">{campaign.name}</td><td className="px-5 py-3 text-right">{formatCurrency(campaign.spend)}</td><td className="px-5 py-3 text-right">{campaign.websiteLeads}</td><td className="px-5 py-3 text-right">{campaign.costPerLead === null ? "—" : formatCurrency(campaign.costPerLead)}</td><td className="px-5 py-3 text-right">{campaign.linkClicks.toLocaleString()}</td></tr>)}</tbody></table></div>
        </section>
      </>}
    </div>
  );
}
