"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSelector } from "@/components/layout/period-selector";
import { InfoTooltip } from "@/components/InfoTooltip";
import { ConversionFunnel } from "@/components/ConversionFunnel";
import { formatCurrency, formatPercent } from "@/lib/dates";
import { CHART_COLORS, SEGMENTS } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

/* ── Types ────────────────────────────────────────────────────────────── */

interface DashboardPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
}

interface FunnelEntry {
  name: string;
  value: number;
  fill: string;
}

interface LeadSource {
  name: string;
  count: number;
}

interface DashboardData {
  period: DashboardPeriod;
  revenue: number;
  qboRevenue: number;
  qboInvoiceCount: number;
  qboBalance: number;
  qboRevenueVariance: number;
  pipelineValue: number;
  newLeads: number;
  conversionRate: number;
  avgTicket: number;
  revenueDelta: number | null;
  leadsDelta: number | null;
  salesFunnel: FunnelEntry[];
  revenueByJobType: Record<string, number>;
  topLeadSources: LeadSource[];
  opportunitiesBySegment: Record<string, number>;
  soldJobsBySegment: Record<string, number>;
}

interface GrossProfitJob {
  jobJnid: string;
  jobName: string;
  address: string | null;
  segment: string;
  salesRepName: string | null;
  jobTypes: string[];
  revenue: number;
  supplierCost: number;
  laborCost: number;
  retailCost: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  dateCompleted: string | null;
}

interface GrossProfitData {
  period: { key: string; label: string };
  summary: {
    totalRevenue: number;
    totalCosts: number;
    totalGrossProfit: number;
    avgMarginPercent: number;
    jobCount: number;
  };
  jobs: GrossProfitJob[];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center text-xs font-medium ${
        isPositive ? "text-green-400" : "text-red-400"
      }`}
    >
      {isPositive ? (
        <svg
          className="w-3 h-3 mr-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg
          className="w-3 h-3 mr-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function formatFullCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getClientName(jobName: string): string {
  const parts = jobName.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : jobName;
}

function buildScopeRevenue(jobs: GrossProfitJob[]) {
  const totals: Record<string, number> = {
    Roof: 0,
    Siding: 0,
    Windows: 0,
    Gutters: 0,
    Repairs: 0,
    Unclassified: 0,
  };

  for (const job of jobs) {
    const types = job.jobTypes.length ? job.jobTypes : ["Unclassified"];
    const splitRevenue = job.revenue / types.length;
    for (const type of types) {
      const label = type === "Repair" ? "Repairs" : type;
      totals[label] = (totals[label] ?? 0) + splitRevenue;
    }
  }

  return Object.entries(totals)
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value > 0);
}

function percentOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

/* ── Custom Recharts Tooltip ─────────────────────────────────────────── */

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; payload?: { fill?: string } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-[#8b949e] mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-[#e6edf3]">
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: entry.payload?.fill ?? CHART_COLORS[i] }}
          />
          {entry.name}: {typeof entry.value === "number" && entry.value > 100
            ? formatCurrency(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [period, setPeriod] = useState("month");

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["dashboard", period],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
  });

  const { data: grossProfitData, isLoading: isGrossProfitLoading } = useQuery<GrossProfitData>({
    queryKey: ["gross-profit-overview", period],
    queryFn: async () => {
      const res = await fetch(`/api/gross-profit?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch gross profit data");
      return res.json();
    },
  });

  const closedJobs = grossProfitData?.jobs ?? [];
  const closedSummary = grossProfitData?.summary;
  const scopeRevenue = buildScopeRevenue(closedJobs);
  const topClosedJobs = [...closedJobs].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const totalCosts = closedSummary?.totalCosts ?? 0;
  const laborCost = closedJobs.reduce((sum, job) => sum + job.laborCost, 0);
  const materialCost = closedJobs.reduce((sum, job) => sum + job.supplierCost, 0);
  const otherCost = closedJobs.reduce((sum, job) => sum + job.retailCost, 0);
  const revenueVariance = (data?.revenue ?? 0) - (closedSummary?.totalRevenue ?? 0);
  const costRows = [
    { label: "Labor", value: laborCost, color: "#58a6ff" },
    { label: "Materials", value: materialCost, color: "#d29922" },
    { label: "Retail/other", value: otherCost, color: "#a371f7" },
  ];

  // Prepare pie chart data from revenueByJobType
  const pieData = data
    ? Object.entries(data.revenueByJobType).map(([name, value], i) => ({
        name,
        value,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }))
    : [];

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            {getGreeting()}, Jack
          </h1>
          <p className="text-[#8b949e] text-sm">
            Maverick Exteriors — Sales & Ops Command Center
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Revenue */}
        <Link href={`/revenue?period=${period}`} className="block group">
          <Card className="h-full bg-[#161b22] border-[#30363d] group-hover:border-[#58a6ff] transition-colors">
            <CardHeader className="pb-2">
              <InfoTooltip label="Revenue" explanation="Sum of all invoice amounts created during this period (accrual basis — based on invoice date, not payment received)">
                <CardTitle className="text-xs font-medium text-[#8b949e]">Revenue</CardTitle>
              </InfoTooltip>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24 bg-[#21262d]" />
              ) : (
                <div>
                  <p className="text-2xl font-bold text-[#e6edf3]">
                    {formatCurrency(data?.revenue ?? 0)}
                  </p>
                  <DeltaBadge value={data?.revenueDelta ?? null} />
                  <div className="mt-2 space-y-1 text-xs text-[#8b949e]">
                    <div className="flex justify-between gap-2">
                      <span>QBO</span>
                      <span className="font-mono text-[#e6edf3]">{formatCurrency(data?.qboRevenue ?? 0)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Diff</span>
                      <span className={`font-mono ${(data?.qboRevenueVariance ?? 0) === 0 ? "text-[#8b949e]" : (data?.qboRevenueVariance ?? 0) > 0 ? "text-yellow-400" : "text-red-400"}`}>
                        {formatFullCurrency(data?.qboRevenueVariance ?? 0)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-medium text-[#58a6ff] group-hover:text-[#79c0ff]">
                    View invoice detail →
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Pipeline */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <InfoTooltip label="Pipeline Value" explanation="Total estimate value of all active jobs currently in Estimating through Invoiced stages (live snapshot, not period-filtered)">
              <CardTitle className="text-xs font-medium text-[#8b949e]">Pipeline Value</CardTitle>
            </InfoTooltip>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {formatCurrency(data?.pipelineValue ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* New Leads */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <InfoTooltip label="New Leads" explanation="Jobs created in JobNimbus during the selected period. Includes archived/test leads — archive them in JobNimbus then sync to remove">
              <CardTitle className="text-xs font-medium text-[#8b949e]">New Leads</CardTitle>
            </InfoTooltip>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-2xl font-bold text-[#e6edf3]">
                  {data?.newLeads ?? 0}
                </p>
                <DeltaBadge value={data?.leadsDelta ?? null} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion Rate */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <InfoTooltip label="Conv Rate" explanation="Percentage of jobs created in this period that have reached &quot;Sold Job&quot; status or beyond">
              <CardTitle className="text-xs font-medium text-[#8b949e]">Conv Rate</CardTitle>
            </InfoTooltip>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {formatPercent(data?.conversionRate ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Avg Ticket */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <InfoTooltip label="Avg Ticket" explanation="Average invoice amount for invoices created in this period">
              <CardTitle className="text-xs font-medium text-[#8b949e]">Avg Ticket</CardTitle>
            </InfoTooltip>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {formatCurrency(data?.avgTicket ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue Command Center ─────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#58a6ff] mb-2">
              From Jack&apos;s sketch
            </p>
            <h2 className="text-xl font-bold text-[#e6edf3]">Revenue Command Center</h2>
            <p className="text-sm text-[#8b949e] mt-1">
              JobNimbus invoices, QuickBooks invoices, the variance between them, work mix, COGS, GP, and the jobs driving the month.
            </p>
          </div>
          <div className="text-xs text-[#8b949e]">
            JN invoices use invoice date. GP uses Paid &amp; Closed jobs by close date.
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          <Card className="bg-[#0f1a2a] border-[#1f6feb]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-[#e6edf3]">
                JN Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 bg-[#21262d]" />
                  ))}
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3">
                      <p className="text-xs text-[#8b949e] mb-1">JobNimbus invoices</p>
                      <p className="text-2xl font-bold text-[#e6edf3]">
                        {formatCurrency(data?.revenue ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3">
                      <p className="text-xs text-[#8b949e] mb-1">QuickBooks invoices</p>
                      <p className="text-2xl font-bold text-[#e6edf3]">
                        {formatCurrency(data?.qboRevenue ?? 0)}
                      </p>
                      <p className="text-xs text-[#484f58]">{data?.qboInvoiceCount ?? 0} QBO invoices</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#8b949e] mb-5">
                    <span>{data?.period.label}</span>
                    <DeltaBadge value={data?.revenueDelta ?? null} />
                    <span className="ml-auto">QBO - JN: </span>
                    <span className={`font-mono ${(data?.qboRevenueVariance ?? 0) === 0 ? "text-[#8b949e]" : (data?.qboRevenueVariance ?? 0) > 0 ? "text-yellow-400" : "text-red-400"}`}>
                      {formatFullCurrency(data?.qboRevenueVariance ?? 0)}
                    </span>
                    <Link href={`/revenue?period=${period}`} className="font-semibold text-[#58a6ff] hover:text-[#79c0ff]">
                      Audit →
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(data?.revenueByJobType ?? {}).map(([name, value], i) => (
                      <div key={name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-[#e6edf3]">{name}</span>
                          <span className="font-mono text-[#8b949e]">{formatCurrency(value)}</span>
                        </div>
                        <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${percentOf(value, data?.revenue ?? 0)}%`,
                              backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#161b22] border-[#30363d]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-[#e6edf3]">
                Work Mix
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isGrossProfitLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-9 bg-[#21262d]" />
                  ))}
                </div>
              ) : scopeRevenue.length === 0 ? (
                <p className="text-sm text-[#8b949e]">No closed jobs with scope data for this period.</p>
              ) : (
                <div className="space-y-3">
                  {scopeRevenue.map((row, i) => (
                    <div key={row.name} className="flex items-center gap-3">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-[#e6edf3]">{row.name}</span>
                          <span className="font-mono text-[#8b949e]">{formatCurrency(row.value)}</span>
                        </div>
                        <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${percentOf(row.value, closedSummary?.totalRevenue ?? 0)}%`,
                              backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#161b22] border-[#30363d]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-[#e6edf3]">
                COGS + GP
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isGrossProfitLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-9 bg-[#21262d]" />
                  ))}
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3">
                      <p className="text-xs text-[#8b949e] mb-1">Gross Profit</p>
                      <p className="text-xl font-bold text-green-400">
                        {formatCurrency(closedSummary?.totalGrossProfit ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3">
                      <p className="text-xs text-[#8b949e] mb-1">GP %</p>
                      <p className="text-xl font-bold text-[#e6edf3]">
                        {formatPercent(closedSummary?.avgMarginPercent ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {costRows.map((row) => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-[#e6edf3]">{row.label}</span>
                          <span className="font-mono text-[#8b949e]">{formatCurrency(row.value)}</span>
                        </div>
                        <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${percentOf(row.value, totalCosts)}%`, backgroundColor: row.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-[#161b22] border-[#30363d] lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-[#e6edf3]">
                Revenue Bridge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#8b949e]">JN invoiced</span>
                  <span className="font-mono text-[#e6edf3]">{formatFullCurrency(data?.revenue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#8b949e]">QuickBooks invoiced</span>
                  <span className="font-mono text-[#e6edf3]">{formatFullCurrency(data?.qboRevenue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#8b949e]">Closed-job revenue</span>
                  <span className="font-mono text-[#e6edf3]">{formatFullCurrency(closedSummary?.totalRevenue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#30363d] pt-4">
                  <span className="text-sm text-[#8b949e]">QBO - JN variance</span>
                  <span className={`font-mono ${(data?.qboRevenueVariance ?? 0) === 0 ? "text-[#8b949e]" : (data?.qboRevenueVariance ?? 0) > 0 ? "text-yellow-400" : "text-red-400"}`}>
                    {formatFullCurrency(data?.qboRevenueVariance ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#8b949e]">JN vs closed timing gap</span>
                  <span className={`font-mono ${revenueVariance >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatFullCurrency(revenueVariance)}
                  </span>
                </div>
                <p className="text-xs text-[#8b949e] leading-relaxed">
                  This separates the CRM invoice rollup from the accounting invoice rollup, then separately shows timing between invoiced work and closed jobs. This is the part that keeps us from lying to ourselves with a pretty number.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#161b22] border-[#30363d] lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-[#e6edf3]">
                Jobs Sorted by Sales Rep / Client Name
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isGrossProfitLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 bg-[#21262d]" />
                  ))}
                </div>
              ) : topClosedJobs.length === 0 ? (
                <p className="text-sm text-[#8b949e]">No Paid &amp; Closed jobs in this period yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#30363d] text-left text-xs uppercase tracking-wide text-[#8b949e]">
                        <th className="pb-2 pr-4 font-medium">Sales Rep</th>
                        <th className="pb-2 pr-4 font-medium">Client</th>
                        <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
                        <th className="pb-2 pr-4 text-right font-medium">GP</th>
                        <th className="pb-2 text-right font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClosedJobs.map((job) => (
                        <tr key={job.jobJnid} className="border-b border-[#21262d] last:border-0">
                          <td className="py-3 pr-4 text-[#e6edf3] whitespace-nowrap">
                            {job.salesRepName ?? "Unassigned"}
                          </td>
                          <td className="py-3 pr-4 text-[#8b949e] min-w-[180px]">
                            <div className="text-[#e6edf3]">{getClientName(job.jobName)}</div>
                            <div className="text-xs text-[#484f58]">{job.jobTypes.join(", ") || "Unclassified"}</div>
                          </td>
                          <td className="py-3 pr-4 text-right font-mono text-[#e6edf3] whitespace-nowrap">
                            {formatCurrency(job.revenue)}
                          </td>
                          <td className={`py-3 pr-4 text-right font-mono whitespace-nowrap ${job.grossProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {formatCurrency(job.grossProfit)}
                          </td>
                          <td className="py-3 text-right font-mono text-[#e6edf3] whitespace-nowrap">
                            {formatPercent(job.marginPercent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Retail Growth Control Room CTA ─────────────────────────── */}
      <Link href="/segments/retail" className="block mb-8 group">
        <Card className="bg-[#0f1a2a] border-[#1f6feb] hover:border-[#58a6ff] transition-colors">
          <CardContent className="p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex rounded-full bg-[#1f6feb]/20 px-2.5 py-1 text-xs font-semibold text-[#58a6ff]">
                  New
                </span>
                <span className="text-xs uppercase tracking-[0.18em] text-[#8b949e]">
                  Growth scoreboard
                </span>
              </div>
              <h2 className="text-xl font-bold text-[#e6edf3] mb-1">
                Retail Growth Control Room
              </h2>
              <p className="max-w-3xl text-sm text-[#8b949e]">
                Track the controllable retail engine separately from insurance upside: pace, pipeline, next money, stale estimates, and the weekly operating targets that get Maverick to the next level.
              </p>
            </div>
            <div className="text-sm font-semibold text-[#58a6ff] group-hover:text-[#79c0ff]">
              Open retail growth →
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* ── Charts Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Sales Funnel - Horizontal Bar Chart */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Sales Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-6 bg-[#21262d]" style={{ width: `${100 - i * 10}%` }} />
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  layout="vertical"
                  data={data?.salesFunnel ?? []}
                  margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: "#8b949e", fontSize: 11 }}
                    axisLine={{ stroke: "#30363d" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#e6edf3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(88,166,255,0.08)" }} />
                  <Bar dataKey="value" name="Jobs" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {(data?.salesFunnel ?? []).map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Job Type - Donut Chart */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Revenue by Job Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-[250px]">
                <Skeleton className="h-40 w-40 rounded-full bg-[#21262d]" />
              </div>
            ) : pieData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px]">
                <p className="text-sm text-[#8b949e]">No revenue data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0];
                      return (
                        <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-lg">
                          <p className="text-[#e6edf3]">
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1.5"
                              style={{ backgroundColor: item.payload?.fill }}
                            />
                            {item.name}: {formatCurrency(item.value as number)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => (
                      <span className="text-xs text-[#8b949e]">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Lead Sources ──────────────────────────────────────────── */}
      <div className="mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Top Lead Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32 bg-[#21262d]" />
                    <Skeleton className="h-4 w-8 bg-[#21262d]" />
                  </div>
                ))}
              </div>
            ) : (data?.topLeadSources ?? []).length === 0 ? (
              <p className="text-sm text-[#8b949e]">No lead source data for this period</p>
            ) : (
              <div className="space-y-2">
                {(data?.topLeadSources ?? []).map((source, i) => {
                  const maxCount = data!.topLeadSources[0]?.count ?? 1;
                  const pct = (source.count / maxCount) * 100;
                  return (
                    <div key={source.name} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-[#e6edf3] truncate mr-2">
                          {source.name}
                        </span>
                        <span className="text-sm font-mono text-[#8b949e] tabular-nums">
                          {source.count}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Conversion Funnel ─────────────────────────────────────────── */}
      <div className="mb-8">
        <ConversionFunnel period={period} />
      </div>

      {/* ── Opportunities by Segment ─────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Opportunities by Segment
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {(Object.entries(SEGMENTS) as [Segment, (typeof SEGMENTS)[Segment]][]).map(
            ([key, segment]) => {
              const count = data?.opportunitiesBySegment?.[key] ?? 0;
              return (
                <Card key={key} className="bg-[#161b22] border-[#30363d]">
                  <CardContent className="pt-6">
                    {isLoading ? (
                      <div>
                        <Skeleton className="h-4 w-20 mb-2 bg-[#21262d]" />
                        <Skeleton className="h-8 w-12 bg-[#21262d]" />
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: segment.color }}
                          />
                          <span className="text-xs font-medium text-[#8b949e]">
                            {segment.label}
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-[#e6edf3]">{count}</p>
                        <p className="text-xs text-[#484f58] mt-0.5">pre-sale jobs</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>
      </div>

      {/* ── Sold Jobs by Segment ──────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Sold Jobs by Segment
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {(Object.entries(SEGMENTS) as [Segment, (typeof SEGMENTS)[Segment]][]).map(
            ([key, segment]) => {
              const count = data?.soldJobsBySegment?.[key] ?? 0;
              return (
                <Card key={key} className="bg-[#161b22] border-[#30363d]">
                  <CardContent className="pt-6">
                    {isLoading ? (
                      <div>
                        <Skeleton className="h-4 w-20 mb-2 bg-[#21262d]" />
                        <Skeleton className="h-8 w-12 bg-[#21262d]" />
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: segment.color }}
                          />
                          <span className="text-xs font-medium text-[#8b949e]">
                            {segment.label}
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-[#e6edf3]">{count}</p>
                        <p className="text-xs text-[#484f58] mt-0.5">production jobs</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>
      </div>

      {/* ── Error State ─────────────────────────────────────────────── */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load dashboard data. Check your database connection and try again.
          </p>
        </div>
      )}
    </div>
  );
}
