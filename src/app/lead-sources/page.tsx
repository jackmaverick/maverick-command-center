"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PeriodSelector } from "@/components/layout/period-selector";
import type { buildAcquisitionReport } from "@/lib/acquisition-report";
type Report = ReturnType<typeof buildAcquisitionReport>;
const dollars = (n: number | null) => n===null ? "Unverified" : n.toLocaleString("en-US",{style:"currency",currency:"USD"});
const date = (d: string | null) => d?.slice(0,10) ?? "None";
export default function LeadSourcesPage() {
  const [period,setPeriod] = useState("last_month");
  const {data,isLoading,isError} = useQuery<Report>({ queryKey:["lead-sources",period],queryFn:async()=>{
    const r=await fetch(`/api/lead-sources?period=${encodeURIComponent(period)}`);
    if(!r.ok)throw new Error("Reporting evidence unavailable");return r.json();
  }});
  return <div className="space-y-6 text-[#e6edf3]">
    <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-2xl font-bold">Lead Sources &amp; Actual Costs</h1>
      <p className="mt-2 text-[#8b949e]">Recorded costs, contact cohorts and explicit evidence gaps.</p></div><PeriodSelector value={period} onChange={setPeriod}/></div>
    {isLoading && <p>Loading reporting evidence...</p>}
    {isError && <p role="alert" className="text-[#f85149]">Reporting evidence unavailable. No acquisition metrics calculated.</p>}
    {data && <>
      <p className="text-sm text-[#8b949e]">{data.period.startDate} to {data.period.endDate} (exclusive) | {data.period.timezone} | Complete days only | Generated {data.generatedAt}</p>
      <div role="note" className="rounded-lg border border-[#d29922] p-4 text-sm">
        Coverage is partial. Missing spend is unknown. Recorded subtotals are not total acquisition cost. Unallocated costs are unverified.
        CRM contact groups are raw job-linked groups, not qualified leads or first-time won customers.
        Actual delivery spend and agency payments use different timing bases and are shown separately.
        {!!data.unavailableSources.length && <p className="mt-2 text-[#f85149]">Unavailable sources: {data.unavailableSources.join(", ")}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {[ ["Recorded delivery subtotal (partial)",dollars(data.totals.recordedDeliverySubtotal)], ["CRM job records",data.totals.jobRecords],
          ["Unique contact groups",data.totals.contactGroups], ["All-channel CPL / Customer CAC","Unverified"] ].map(([label,value])=><div key={label} className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">{label}</p><p className="mt-2 text-xl">{value}</p></div>)}
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#30363d] bg-[#161b22] p-4">
        <h2 className="mb-4 font-semibold">Channel costs and contact cohorts</h2>
        <table className="w-full text-sm"><thead><tr className="text-left text-[#8b949e]">{["Channel","Delivery cost (partial)","Agency paid","Setup paid","Jobs","Contacts","Existing contacts","Dated signed contacts","Platform actions / media CPL"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{data.channels.map(c=><tr key={c.channel} className="border-t border-[#30363d]">
            <td className="p-2">{c.channel}</td><td className="p-2">{dollars(c.recordedDeliveryCost)}</td><td className="p-2">{dollars(c.agencyPayments)}</td><td className="p-2">{dollars(c.setupPayments)}</td>
            <td className="p-2">{c.jobRecords}</td><td className="p-2">{c.contactGroups}</td><td className="p-2">{c.existingContacts}</td><td className="p-2">{c.datedSignedContactGroups}</td>
            <td className="p-2">{c.platformLeads===null ? "Unverified" : `${c.platformLeads} / ${dollars(c.platformMediaCpl)}`}</td>
          </tr>)}</tbody></table>
        <p className="mt-4 text-xs text-[#8b949e]">Platform actions are not CRM leads. Dated signatures are active estimates signed after the job was created and before the cohort cutoff; not proven lifetime-first purchases. Qualified lead rate, show rate, customer CAC and fully loaded CPL remain unverified.</p>
      </div>
      <div className="rounded-lg border border-[#30363d] p-4"><h2 className="font-semibold">Planning budget - excluded from actual costs</h2>
        <p className="mt-2 text-sm">Nominal recurring monthly equivalent: {dollars(data.budget.recurringMonthly)} | Planned one-time entries in period: {dollars(data.budget.oneTimePlanned)}</p>
        <p className="mt-2 text-xs text-[#8b949e]">No budget is allocated into CPL or CAC. Monthly equivalents are plans, not payments or delivered spend.</p></div>
      <section><h2 className="mb-3 font-semibold">Coverage and audit trail</h2>
        {data.channels.map(c=><details key={c.channel} className="mb-3 rounded-lg border border-[#30363d] p-4">
          <summary className="cursor-pointer">{c.channel}: {c.coverage.selectedRows} cost rows, {c.coverage.missingAmounts} missing amounts | {c.coverage.stale?"Stale / unverified freshness":"Recent source update; coverage unverified"}</summary>
          <p className="mt-3 text-xs text-[#8b949e]">Selected observed dates {date(c.coverage.firstObservedDate)} - {date(c.coverage.lastObservedDate)} ({c.coverage.observedDates} dates). Ledger dates {date(c.coverage.ledgerFirstDate)} - {date(c.coverage.ledgerLastDate)}. Missing amounts across ledger: {c.coverage.missingAmountsAllTime}. Latest source update {c.coverage.latestSync??"Unknown"}. Missing-contact jobs: {c.missingContactJobs}. CRM sync range {c.crmCoverage.oldestSync??"Unknown"} - {c.crmCoverage.latestSync??"Unknown"}.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead><tr>{["Source / row ID","Basis","Date","Amount","Service dates","Reference"].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{c.evidence.map(e=><tr key={`${e.source}:${e.id}`} className="border-t border-[#30363d]"><td className="p-2">{e.source}<br/>{e.id}</td><td className="p-2">{e.kind}</td><td className="p-2">{e.date}</td><td className="p-2">{dollars(e.amount)} {e.currency}</td><td className="p-2">{e.serviceStart??"N/A"} - {e.serviceEnd??"N/A"}</td><td className="p-2">{e.reference??"Not supplied"}</td></tr>)}</tbody></table></div>
        </details>)}
      </section>
      <section className="text-xs text-[#8b949e]"><h2 className="mb-2 font-semibold text-[#e6edf3]">Reporting definitions</h2><ul className="list-disc space-y-2 pl-5">{data.definitions.map(t=><li key={t}>{t}</li>)}</ul></section>
    </>}
  </div>;
}
