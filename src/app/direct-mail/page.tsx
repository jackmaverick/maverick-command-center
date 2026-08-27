"use client";

import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock3, ExternalLink, Mail, MapPin,
  PackageCheck, Printer, RadioTower, RefreshCw, ShieldCheck,
} from "lucide-react";
import type {
  DirectMailDashboardData, DirectMailDashboardResponse, DirectMailDropReport,
} from "@/lib/direct-mail/types";

const number = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatDate(value: string | null) {
  if (!value) return "Not proven";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function StatCard({ label, value, detail, icon: Icon, tone = "text-[#58a6ff]" }: {
  label: string; value: string; detail: string; icon: ComponentType<{ className?: string }>; tone?: string;
}) {
  return <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4">
    <div className={`flex items-center gap-2 text-xs ${tone}`}><Icon className="h-4 w-4" />{label}</div>
    <div className="mt-2 text-2xl font-semibold text-[#e6edf3]">{value}</div>
    <div className="mt-1 text-xs leading-5 text-[#8b949e]">{detail}</div>
  </div>;
}

function StatusBadge({ status }: { status: string }) {
  const proven = ["postal_confirmed", "complete"].includes(status);
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${proven
    ? "border-[#3fb950]/30 bg-[#3fb950]/10 text-[#3fb950]"
    : "border-[#d29922]/30 bg-[#d29922]/10 text-[#d29922]"}`}>
    {status.replaceAll("_", " ")}
  </span>;
}

function Funnel({ drop }: { drop: DirectMailDropReport }) {
  const stages = [
    ["Source", drop.sourceRecipientCount], ["Eligible", drop.eligibleRecipientCount],
    ["Packaged", drop.packagedRecipientCount], ["Submitted", drop.submittedRecipientCount],
    ["Accepted", drop.acceptedRecipientCount], ["Mailed proof", drop.addressesConfirmedMailed],
  ] as const;
  const maximum = Math.max(drop.sourceRecipientCount, 1);
  return <div className="grid gap-3 md:grid-cols-6">{stages.map(([label, value]) =>
    <div key={label} className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
      <div className="text-xs text-[#8b949e]">{label}</div>
      <div className="mt-1 font-mono text-lg text-[#e6edf3]">{number.format(value)}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#21262d]">
        <div className="h-full rounded-full bg-[#58a6ff]" style={{ width: `${Math.min(100, value / maximum * 100)}%` }} />
      </div>
    </div>)}</div>;
}

function Unavailable({ response }: { response: Exclude<DirectMailDashboardResponse, DirectMailDashboardData> }) {
  return <div className="rounded-lg border border-[#d29922]/40 bg-[#d29922]/10 p-6">
    <div className="flex items-center gap-2 text-[#d29922]"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Live reporting is not available yet</h2></div>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#c9d1d9]">{response.message}</p>
    <p className="mt-2 text-xs text-[#8b949e]">No historical sample campaign data is being substituted. Deploy the v2 reporting migration, then refresh this page.</p>
  </div>;
}

function CampaignScorecard({ data }: { data: DirectMailDashboardData }) {
  return <section className="mt-8 rounded-lg border border-[#30363d] bg-[#161b22]">
    <div className="border-b border-[#30363d] p-5"><h2 className="font-semibold text-[#e6edf3]">Campaign scorecard</h2><p className="mt-1 text-xs text-[#8b949e]">Aggregate reporting only; homeowner names and addresses stay out of the browser.</p></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="text-xs uppercase text-[#8b949e]"><tr className="border-b border-[#30363d]">
        <th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Homes</th><th className="px-4 py-3 text-right">Touches</th><th className="px-4 py-3 text-right">Gaps</th><th className="px-4 py-3 text-right">Leads</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Revenue</th>
      </tr></thead>
      <tbody>{data.campaigns.map((row) => <tr key={row.campaignId} className="border-b border-[#30363d]/70">
        <td className="px-4 py-3"><div className="flex items-center gap-2 font-medium text-[#e6edf3]">{row.campaignName}{row.driveWebUrl ? <a href={row.driveWebUrl} target="_blank" rel="noreferrer" aria-label={`Open ${row.campaignName} in Drive`}><ExternalLink className="h-3.5 w-3.5 text-[#58a6ff]" /></a> : null}</div><div className="mt-1 text-xs text-[#8b949e]">{row.stormEventCode ?? "Evergreen"} · {formatDate(row.stormDate)}</div></td>
        <td className="px-4 py-3"><StatusBadge status={row.campaignStatus} /></td>
        <td className="px-4 py-3 text-right font-mono text-[#e6edf3]">{number.format(row.uniqueAddressesConfirmedMailed)}</td>
        <td className="px-4 py-3 text-right font-mono text-[#e6edf3]">{number.format(row.confirmedMailTouches)}</td>
        <td className="px-4 py-3 text-right font-mono text-[#d29922]">{number.format(row.totalAddressGaps)}</td>
        <td className="px-4 py-3 text-right font-mono text-[#e6edf3]">{number.format(row.attributedLeads)}</td>
        <td className="px-4 py-3 text-right font-mono text-[#e6edf3]">{number.format(row.attributedSales)}</td>
        <td className="px-4 py-3 text-right font-mono text-[#3fb950]">{money.format(row.attributedRevenue)}</td>
      </tr>)}{data.campaigns.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-[#8b949e]">No direct-mail campaigns have been recorded yet.</td></tr> : null}</tbody>
    </table></div>
  </section>;
}

function DropFunnels({ data }: { data: DirectMailDashboardData }) {
  return <section className="mt-8 space-y-4">
    <div><h2 className="font-semibold text-[#e6edf3]">Drop-by-drop funnel</h2><p className="mt-1 text-xs text-[#8b949e]">Every dated mailing keeps its own frozen package, proof state, and gaps.</p></div>
    {data.drops.map((drop) => <article key={drop.dropId} className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><h3 className="font-medium text-[#e6edf3]">{drop.campaignName} · Drop {drop.dropNumber}</h3>{drop.driveWebUrl ? <a href={drop.driveWebUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 text-[#58a6ff]" /></a> : null}</div><div className="mt-1 text-xs text-[#8b949e]">Planned {formatDate(drop.plannedMailDate)} · Postal proof {formatDate(drop.postalDropAt)} · {drop.hailAgeDays ?? "unknown"} hail days</div></div>
        <StatusBadge status={drop.dropStatus} />
      </div>
      <Funnel drop={drop} />
      {drop.totalAddressGaps > 0 ? <div className="mt-4 text-xs text-[#d29922]">Gaps: {number.format(drop.eligibleNotPackaged)} eligible not packaged · {number.format(drop.packagedNotSubmitted)} packaged not submitted · {number.format(drop.unconfirmedAfterPostalDrop)} unconfirmed after postal drop</div> : null}
    </article>)}
    {data.drops.length === 0 ? <div className="rounded-lg border border-dashed border-[#30363d] p-8 text-center text-sm text-[#8b949e]">No dated drops have been recorded yet.</div> : null}
  </section>;
}

function MessageGuidance({ data }: { data: DirectMailDashboardData }) {
  return <section className="mt-8 rounded-lg border border-[#30363d] bg-[#161b22] p-5">
    <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#a371f7]" /><h2 className="font-semibold text-[#e6edf3]">Next-touch message guidance</h2></div>
    <p className="mt-1 text-xs text-[#8b949e]">Rules are selected from hail age, touch number, storm confidence, and observed message performance.</p>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">{data.recommendations.map((item) => <div key={item.campaignId} className="rounded-md border border-[#30363d] bg-[#0d1117] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-[#e6edf3]">{item.campaignName}</div><div className="mt-1 text-xs text-[#8b949e]">Day {item.currentHailAgeDays} · touch {item.nextTouchNumber} · {item.hailAgeBand}</div></div><span className="rounded-full border border-[#30363d] px-2 py-1 text-xs text-[#a371f7]">{item.messageLane ?? "No matching rule"}</span></div>
      <p className="mt-3 text-sm leading-6 text-[#c9d1d9]">{item.copyGuidance ?? "The current rule set has no approved recommendation for this campaign."}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded border border-[#30363d] px-2 py-1 text-[#8b949e]">{item.timingAction ?? "Review timing"}</span><span className="rounded border border-[#30363d] px-2 py-1 text-[#8b949e]">{item.evidenceStrength.replaceAll("_", " ")} · n={number.format(item.sampleSize)} · {item.observedResponseRate === null ? "No evidence" : `${(item.observedResponseRate * 100).toFixed(1)}%`}</span>{item.requiredClaimsReview ? <span className="rounded border border-[#d29922]/30 px-2 py-1 text-[#d29922]">claims review required</span> : null}</div>
    </div>)}{data.recommendations.length === 0 ? <div className="text-sm text-[#8b949e]">No active campaign currently has a storm-based recommendation.</div> : null}</div>
  </section>;
}

function Dashboard({ data }: { data: DirectMailDashboardData }) {
  const { summary } = data;
  return <>
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      <StatCard label="Confirmed homes" value={number.format(summary.uniqueAddressesConfirmedMailed)} detail="Unique addresses with postal evidence" icon={MapPin} tone="text-[#3fb950]" />
      <StatCard label="Confirmed touches" value={number.format(summary.confirmedMailTouches)} detail={`${number.format(summary.repeatMailTouches)} repeat touches`} icon={Mail} />
      <StatCard label="Address gaps" value={number.format(summary.totalAddressGaps)} detail="Eligible, packaging, or confirmation gaps" icon={AlertTriangle} tone="text-[#d29922]" />
      <StatCard label="Attributed leads" value={number.format(summary.attributedLeads)} detail={`${number.format(summary.confirmedLeads)} confirmed direct-mail leads`} icon={RadioTower} />
      <StatCard label="Attributed sales" value={number.format(summary.attributedSales)} detail={`${money.format(summary.attributedRevenue)} attributed revenue`} icon={BarChart3} tone="text-[#3fb950]" />
    </div>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      <StatCard label="Campaigns" value={number.format(summary.campaignCount)} detail={`${number.format(summary.dropCount)} dated drops`} icon={Printer} />
      <StatCard label="Recorded cost" value={money.format(summary.totalCost)} detail="Print plus postage currently recorded" icon={PackageCheck} />
      <StatCard label="Evidence policy" value="Recipient level" detail="Upload, request, and acceptance are not postal proof" icon={ShieldCheck} tone="text-[#a371f7]" />
    </div>
    <CampaignScorecard data={data} /><DropFunnels data={data} /><MessageGuidance data={data} />
  </>;
}

export default function DirectMailPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DirectMailDashboardResponse>({
    queryKey: ["direct-mail-dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/direct-mail", { cache: "no-store" });
      const body = await response.json() as DirectMailDashboardResponse;
      if (!response.ok && body.available !== false) throw new Error("Direct-mail reporting could not be loaded.");
      return body;
    },
    staleTime: 60_000,
  });

  return <div>
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2 text-sm text-[#58a6ff]"><Mail className="h-4 w-4" />Direct Mail Operating System</div><h1 className="mt-2 text-2xl font-bold text-[#e6edf3]">Closed-loop scorecard</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b949e]">From target list through frozen Drive package, postal proof, repeat touches, JobNimbus attribution, and revenue.</p></div>
      <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center gap-2 self-start rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] hover:bg-[#21262d] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</button>
    </div>
    {isLoading ? <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-8 text-sm text-[#8b949e]">Loading direct-mail evidence…</div> : null}
    {isError ? <div className="rounded-lg border border-[#f85149]/40 bg-[#f85149]/10 p-6 text-sm text-[#f85149]">{error instanceof Error ? error.message : "Direct-mail reporting could not be loaded."}</div> : null}
    {data?.available === false ? <Unavailable response={data} /> : null}
    {data?.available === true ? <Dashboard data={data} /> : null}
    <div className="mt-6 flex items-start gap-2 text-xs leading-5 text-[#8b949e]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3fb950]" />{data?.available === true ? `${data.evidenceBoundary} Refreshed ${new Date(data.generatedAt).toLocaleString()}.` : "The page intentionally distinguishes prepared, submitted, accepted, and confirmed mailed states."}</div>
  </div>;
}
