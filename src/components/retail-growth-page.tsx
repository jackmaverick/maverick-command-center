"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/dates";

interface RetailGrowthData {
  period: { key: string; label: string; start: string; end: string };
  target: {
    weeklyRevenueGoal: number;
    thisWeekRevenue: number;
    gapThisWeek: number;
    jobsNeededThisWeek: number | null;
  };
  summary: {
    invoicedRevenue: number;
    collectedRevenue: number;
    invoiceCount: number;
    soldJobs: number;
    soldValue: number;
    avgTicket: number;
    openPipelineValue: number;
    openRetailJobs: number;
    openEstimateValue: number;
    scheduled14Value: number;
    scheduled14Jobs: number;
    closedGrossProfit: number;
    closedMarginPct: number | null;
  };
  stages: Array<{ stage: string; jobs: number; value: number; oldestDays: number | null }>;
  reps: Array<{
    repName: string;
    newLeads: number;
    soldJobs: number;
    lostJobs: number;
    openJobs: number;
    openPipeline: number;
    soldValue: number;
    invoicedRevenue: number;
    estimateCloseRate: number | null;
    avgFollowupDays: number | null;
  }>;
  actions: Array<{
    jobJnid: string;
    jobNumber: string | null;
    jobName: string;
    repName: string;
    status: string;
    source: string;
    value: number;
    dueAmount: number;
    invoiceNumber: string | null;
    ageDays: number | null;
    reason: string;
    priority: string;
    jobUrl: string;
  }>;
  margins: Array<{
    jobJnid: string;
    jobName: string;
    repName: string;
    status: string;
    revenue: number;
    materialCost: number;
    subcontractorCost: number;
    laborCost: number;
    totalCost: number;
    grossProfit: number;
    marginPct: number | null;
    costStatus: string;
    jobUrl: string;
  }>;
  sources: Array<{
    sourceName: string;
    jobs: number;
    soldJobs: number;
    soldValue: number;
    openPipeline: number;
  }>;
  dataHealth: {
    missingSource: number;
    missingRep: number;
    missingValue: number;
    missingCost: number;
    possibleMisclassified: number;
    notes: string[];
  };
}

function Card({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "text-[#e6edf3]",
    good: "text-green-400",
    warn: "text-yellow-400",
    bad: "text-red-400",
  }[tone];

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <p className="text-xs uppercase tracking-wide text-[#8b949e] mb-2">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-[#8b949e] mt-2 leading-relaxed">{sub}</p>}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <Skeleton className="h-3 w-24 bg-[#21262d] mb-3" />
          <Skeleton className="h-7 w-20 bg-[#21262d]" />
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value, max, color = "#58a6ff" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const high = priority === "high";
  return (
    <span className={`text-[10px] uppercase tracking-wide rounded px-2 py-0.5 ${high ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"}`}>
      {priority}
    </span>
  );
}

export function RetailGrowthPage() {
  const [period, setPeriod] = useState("month");
  const { data, isLoading, isError } = useQuery<RetailGrowthData>({
    queryKey: ["retail-growth", period],
    queryFn: async () => {
      const res = await fetch(`/api/retail-growth?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch retail growth data");
      return res.json();
    },
  });

  const maxStageValue = Math.max(1, ...(data?.stages.map((s) => s.value) ?? [1]));
  const targetProgress = data
    ? Math.min(100, (data.target.thisWeekRevenue / data.target.weeklyRevenueGoal) * 100)
    : 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏗️</span>
            <h1 className="text-2xl font-bold text-[#58a6ff]">Retail Growth Control Room</h1>
          </div>
          <p className="text-sm text-[#8b949e] mt-2 max-w-3xl">
            Explicit Retail jobs only. No catch-all bucket, no test jobs, and no fake precision. This page is built to answer: are we on pace, where is the next retail money, and what needs action today?
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isError && (
        <div className="my-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
          Retail data failed to load. The page is fine, the plumbing is being dramatic.
        </div>
      )}

      <section className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 my-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#8b949e]">Weekly Retail Target</p>
            <h2 className="text-xl font-semibold text-[#e6edf3] mt-1">
              {isLoading || !data
                ? "Loading target pace"
                : `${formatCurrency(data.target.thisWeekRevenue)} / ${formatCurrency(data.target.weeklyRevenueGoal)}`}
            </h2>
          </div>
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm min-w-[320px]">
              <div>
                <p className="text-[#8b949e]">Gap</p>
                <p className="text-[#e6edf3] font-mono">{formatCurrency(data.target.gapThisWeek)}</p>
              </div>
              <div>
                <p className="text-[#8b949e]">Jobs needed</p>
                <p className="text-[#e6edf3] font-mono">{data.target.jobsNeededThisWeek ?? "n/a"}</p>
              </div>
              <div>
                <p className="text-[#8b949e]">Progress</p>
                <p className="text-[#e6edf3] font-mono">{targetProgress.toFixed(0)}%</p>
              </div>
            </div>
          )}
        </div>
        <ProgressBar value={data?.target.thisWeekRevenue ?? 0} max={data?.target.weeklyRevenueGoal ?? 1} />
      </section>

      {isLoading || !data ? (
        <LoadingGrid />
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card label={`${data.period.label} Invoiced`} value={formatCurrency(data.summary.invoicedRevenue)} sub={`${data.summary.invoiceCount} active invoices`} />
            <Card label="Sold Value" value={formatCurrency(data.summary.soldValue)} sub={`${data.summary.soldJobs} jobs moved sold this period`} tone="good" />
            <Card label="Open Retail Pipeline" value={formatCurrency(data.summary.openPipelineValue)} sub={`${data.summary.openRetailJobs} open retail jobs`} />
            <Card label="Next 14 Days Scheduled" value={formatCurrency(data.summary.scheduled14Value)} sub={`${data.summary.scheduled14Jobs} scheduled retail jobs`} tone="warn" />
            <Card label="Open Estimate Value" value={formatCurrency(data.summary.openEstimateValue)} sub="Estimating + Estimate Sent" />
            <Card label="Avg Sold Ticket" value={formatCurrency(data.summary.avgTicket)} sub="Sold value divided by sold jobs" />
            <Card label="Closed GP" value={formatCurrency(data.summary.closedGrossProfit)} sub="From v_job_total_costs" tone={data.summary.closedGrossProfit >= 0 ? "good" : "bad"} />
            <Card label="Closed Margin" value={data.summary.closedMarginPct === null ? "n/a" : formatPercent(data.summary.closedMarginPct)} sub="Cost coverage dependent" tone={(data.summary.closedMarginPct ?? 0) >= 25 ? "good" : "warn"} />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <div className="xl:col-span-2 bg-[#161b22] border border-[#30363d] rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#e6edf3]">Today&apos;s Retail Moves</h2>
                  <p className="text-xs text-[#8b949e] mt-1">Ranked work queue: follow-up, scheduling, invoicing, collections, and cleanup.</p>
                </div>
                <span className="text-xs text-[#8b949e]">{data.actions.length} open items</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#8b949e] text-xs">Priority</TableHead>
                    <TableHead className="text-[#8b949e] text-xs">Job</TableHead>
                    <TableHead className="text-[#8b949e] text-xs">Rep</TableHead>
                    <TableHead className="text-[#8b949e] text-xs">Why</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Value</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.actions.length === 0 ? (
                    <TableRow className="border-[#21262d]"><TableCell colSpan={6} className="text-center py-8 text-[#8b949e]">No retail action items. Suspiciously peaceful.</TableCell></TableRow>
                  ) : data.actions.map((action) => (
                    <TableRow key={`${action.jobJnid}-${action.reason}-${action.invoiceNumber ?? "job"}`} className="border-[#21262d]">
                      <TableCell><PriorityBadge priority={action.priority} /></TableCell>
                      <TableCell className="text-sm">
                        <a href={action.jobUrl} target="_blank" rel="noreferrer" className="text-[#58a6ff] hover:underline">
                          {action.jobName}
                        </a>
                        <p className="text-xs text-[#8b949e] mt-1">{action.status}{action.invoiceNumber ? ` · Invoice #${action.invoiceNumber}` : ""}</p>
                      </TableCell>
                      <TableCell className="text-sm text-[#e6edf3]">{action.repName}</TableCell>
                      <TableCell className="text-sm text-[#e6edf3]">{action.reason}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{formatCurrency(action.dueAmount || action.value)}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#8b949e]">{action.ageDays ?? 0}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">Data Health</h2>
              <p className="text-xs text-[#8b949e] mb-4">If this is dirty, Brent&apos;s numbers are dirty. Nature is healing, slowly.</p>
              <div className="space-y-3">
                {[
                  ["Missing source", data.dataHealth.missingSource],
                  ["Missing rep", data.dataHealth.missingRep],
                  ["Missing value", data.dataHealth.missingValue],
                  ["Missing cost", data.dataHealth.missingCost],
                  ["Possible misclassified", data.dataHealth.possibleMisclassified],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between bg-[#21262d] rounded px-3 py-2">
                    <span className="text-xs text-[#e6edf3]">{label}</span>
                    <span className={`text-xs font-mono ${Number(value) > 0 ? "text-yellow-400" : "text-green-400"}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-[#30363d] space-y-2">
                {data.dataHealth.notes.map((note) => (
                  <p key={note} className="text-[11px] leading-relaxed text-[#8b949e]">• {note}</p>
                ))}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">Retail Funnel by Current Stage</h2>
              <p className="text-xs text-[#8b949e] mb-4">Open retail jobs only, with value and oldest age in each stage.</p>
              <div className="space-y-4">
                {data.stages.map((stage) => (
                  <div key={stage.stage}>
                    <div className="flex justify-between mb-1 text-xs">
                      <span className="text-[#e6edf3]">{stage.stage}</span>
                      <span className="text-[#8b949e] font-mono">{stage.jobs} jobs · {formatCurrency(stage.value)}{stage.oldestDays ? ` · oldest ${stage.oldestDays}d` : ""}</span>
                    </div>
                    <ProgressBar value={stage.value} max={maxStageValue} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">Lead Source Reality Check</h2>
              <p className="text-xs text-[#8b949e] mb-4">Retail pipeline and sold value by source. Unknown is the shame bucket.</p>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#8b949e] text-xs">Source</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">New</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Sold</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Sold $</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Open $</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sources.map((source) => (
                    <TableRow key={source.sourceName} className="border-[#21262d]">
                      <TableCell className="text-sm text-[#e6edf3]">{source.sourceName}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{source.jobs}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{source.soldJobs}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{formatCurrency(source.soldValue)}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{formatCurrency(source.openPipeline)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">Rep Retail Scorecard</h2>
              <p className="text-xs text-[#8b949e] mb-4">Sales creation, open pipeline, follow-up drag, and revenue by rep.</p>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#8b949e] text-xs">Rep</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">New</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Sold</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Close</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Open $</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reps.map((rep) => (
                    <TableRow key={rep.repName} className="border-[#21262d]">
                      <TableCell className="text-sm text-[#e6edf3]">{rep.repName}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{rep.newLeads}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-green-400">{rep.soldJobs}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{rep.estimateCloseRate === null ? "n/a" : formatPercent(rep.estimateCloseRate)}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{formatCurrency(rep.openPipeline)}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#8b949e]">{rep.avgFollowupDays === null ? "n/a" : `${rep.avgFollowupDays}d`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">Closed Retail Margin Snapshot</h2>
              <p className="text-xs text-[#8b949e] mb-4">Closed jobs this period from v_job_total_costs. Missing cost coverage stays visible.</p>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#8b949e] text-xs">Job</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Cost</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">GP</TableHead>
                    <TableHead className="text-[#8b949e] text-xs text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.margins.length === 0 ? (
                    <TableRow className="border-[#21262d]"><TableCell colSpan={5} className="text-center py-8 text-[#8b949e]">No closed retail margin rows for this period</TableCell></TableRow>
                  ) : data.margins.map((row) => (
                    <TableRow key={row.jobJnid} className="border-[#21262d]">
                      <TableCell className="text-sm">
                        <a href={row.jobUrl} target="_blank" rel="noreferrer" className="text-[#58a6ff] hover:underline">{row.jobName}</a>
                        <p className="text-xs text-[#8b949e] mt-1">{row.repName} · {row.costStatus}</p>
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{formatCurrency(row.revenue)}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{formatCurrency(row.totalCost)}</TableCell>
                      <TableCell className={`text-sm text-right font-mono ${row.grossProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(row.grossProfit)}</TableCell>
                      <TableCell className="text-sm text-right font-mono text-[#e6edf3]">{row.marginPct === null ? "n/a" : formatPercent(row.marginPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
