"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSelector } from "@/components/layout/period-selector";
import { InfoTooltip } from "@/components/InfoTooltip";
import { formatCurrency, formatPercent } from "@/lib/dates";
import { CHART_COLORS, SEGMENTS } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

/* -- Types ----------------------------------------------------------------- */

interface LeadSourceEntry {
  source: string;
  totalLeads: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  revenue: number;
  avgTicket: number;
  acquisitionCost: number;
  exactCost: number;
  allocatedCost: number;
  costPerLead: number | null;
  cac: number | null;
  roas: number | null;
  costBasis: "exact" | "allocated" | "mixed" | "none";
  segmentBreakdown: Record<string, number>;
}

interface TopSourceEntry {
  source: string;
  value: number;
}

interface LeadSourcesData {
  period: { key: string; label: string };
  sources: LeadSourceEntry[];
  acquisition: {
    totalCost: number;
    recurringMarketingCost: number;
    oneTimeMarketingCost: number;
    exactMarketingCost: number;
    paidLeads: number;
    paidWonJobs: number;
    paidRevenue: number;
    blendedCac: number | null;
    costPerLead: number | null;
    roas: number | null;
    totalMarketingBudget: number;
    missingExactCostSources: string[];
  };
  topSources: {
    byVolume: TopSourceEntry[];
    byCloseRate: TopSourceEntry[];
  };
  insights: string[];
}

/* -- Sort helpers ---------------------------------------------------------- */

type SortKey =
  | "source"
  | "totalLeads"
  | "wonJobs"
  | "lostJobs"
  | "closeRate"
  | "revenue"
  | "avgTicket"
  | "acquisitionCost"
  | "costPerLead"
  | "cac"
  | "roas";

type SortDir = "asc" | "desc";

/* -- Custom Tooltip -------------------------------------------------------- */

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
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

/* -- Skeleton Loaders ------------------------------------------------------ */

function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-4"
        >
          <Skeleton className="h-3 w-20 bg-[#21262d] mb-2" />
          <Skeleton className="h-7 w-24 bg-[#21262d]" />
        </div>
      ))}
    </div>
  );
}

function formatNullableCurrency(value: number | null): string {
  return value === null ? "--" : formatCurrency(value);
}

function formatNullableNumber(value: number | null, suffix = ""): string {
  return value === null ? "--" : `${value.toFixed(1)}${suffix}`;
}

function costBasisLabel(source: LeadSourceEntry): string {
  switch (source.costBasis) {
    case "exact":
      return "Exact";
    case "mixed":
      return "Mixed";
    case "allocated":
      return "Allocated";
    case "none":
    default:
      return "No cost";
  }
}

/* -- Main Component -------------------------------------------------------- */

export default function LeadSourcesPage() {
  const [period, setPeriod] = useState("month");
  const [sortKey, setSortKey] = useState<SortKey>("totalLeads");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, isError } = useQuery<LeadSourcesData>({
    queryKey: ["lead-sources", period],
    queryFn: async () => {
      const res = await fetch(`/api/lead-sources?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch lead source data");
      return res.json();
    },
  });

  const sortedSources = useMemo(() => {
    if (!data?.sources) return [];
    const sorted = [...data.sources].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? ((aVal as number | null) ?? -1) - ((bVal as number | null) ?? -1)
        : ((bVal as number | null) ?? -1) - ((aVal as number | null) ?? -1);
    });
    return sorted;
  }, [data, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  // Horizontal bar chart data (sorted by volume)
  const barChartData = useMemo(() => {
    if (!data?.sources) return [];
    return [...data.sources]
      .sort((a, b) => b.totalLeads - a.totalLeads)
      .map((s, i) => ({
        source: s.source,
        totalLeads: s.totalLeads,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [data]);

  // Derive KPIs
  const totalSources = data?.sources?.length ?? 0;
  const totalLeads = data?.sources?.reduce((s, r) => s + r.totalLeads, 0) ?? 0;
  const bestCloseRateSource = data?.sources?.length
    ? [...data.sources].sort((a, b) => b.closeRate - a.closeRate)[0]
    : null;
  const topRevenueSource = data?.sources?.length
    ? [...data.sources].sort((a, b) => b.revenue - a.revenue)[0]
    : null;

  // Segment breakdown: for each segment, show top sources by count
  const segmentTopSources = useMemo(() => {
    if (!data?.sources) return {} as Record<string, { source: string; count: number }[]>;
    const result: Record<string, { source: string; count: number }[]> = {};
    for (const segKey of Object.keys(SEGMENTS)) {
      const entries = data.sources
        .filter((s) => (s.segmentBreakdown?.[segKey] ?? 0) > 0)
        .map((s) => ({ source: s.source, count: s.segmentBreakdown[segKey] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      result[segKey] = entries;
    }
    return result;
  }, [data]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Lead Sources
          </h1>
          <p className="text-[#8b949e]">
            Analyze lead source performance — volume, close rates, revenue, and
            cost-per-acquisition by channel.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <KPISkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="mb-1">
              <InfoTooltip label="Sources Tracked" explanation="Number of distinct lead sources (e.g. Referral, Roofle, Website) with at least one job in this period." />
            </div>
            <p className="text-xl font-bold text-[#e6edf3]">{totalSources}</p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="mb-1">
              <InfoTooltip label="Total Leads" explanation="Total jobs created across all lead sources in this period. A lead = a job created in JobNimbus." />
            </div>
            <p className="text-xl font-bold text-[#e6edf3]">{totalLeads}</p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="mb-1">
              <InfoTooltip label="Best Close Rate" explanation="Lead source with the highest percentage of jobs reaching Sold Job or beyond. Only sources with 3+ leads are considered." />
            </div>
            <p className="text-xl font-bold text-[#3fb950]">
              {bestCloseRateSource
                ? `${formatPercent(bestCloseRateSource.closeRate)}`
                : "--"}
            </p>
            {bestCloseRateSource && (
              <p className="text-xs text-[#8b949e] mt-0.5">
                {bestCloseRateSource.source}
              </p>
            )}
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="mb-1">
              <InfoTooltip label="Top Revenue Source" explanation="Lead source generating the highest total invoice revenue in this period. Revenue is based on invoice creation date (accrual basis)." />
            </div>
            <p className="text-xl font-bold text-[#58a6ff]">
              {topRevenueSource
                ? formatCurrency(topRevenueSource.revenue)
                : "--"}
            </p>
            {topRevenueSource && (
              <p className="text-xs text-[#8b949e] mt-0.5">
                {topRevenueSource.source}
              </p>
            )}
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="mb-1">
              <InfoTooltip label="Blended CAC" explanation="Acquisition cost divided by won jobs for paid channels in this period. Exact campaign costs are used when present; otherwise the marketing budget bucket is allocated by lead share." />
            </div>
            <p className="text-xl font-bold text-[#d29922]">
              {formatNullableCurrency(data?.acquisition?.blendedCac ?? null)}
            </p>
            <p className="text-xs text-[#8b949e] mt-0.5">
              {formatCurrency(data?.acquisition?.totalCost ?? 0)} tracked cost
            </p>
          </div>
        </div>
      )}

      {!isLoading && data?.acquisition && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-[#8b949e]">Paid Leads</p>
              <p className="mt-1 font-mono text-lg text-[#e6edf3]">{data.acquisition.paidLeads}</p>
            </div>
            <div>
              <p className="text-xs text-[#8b949e]">Paid Wins</p>
              <p className="mt-1 font-mono text-lg text-[#3fb950]">{data.acquisition.paidWonJobs}</p>
            </div>
            <div>
              <p className="text-xs text-[#8b949e]">Cost / Lead</p>
              <p className="mt-1 font-mono text-lg text-[#e6edf3]">
                {formatNullableCurrency(data.acquisition.costPerLead)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8b949e]">ROAS</p>
              <p className="mt-1 font-mono text-lg text-[#e6edf3]">
                {formatNullableNumber(data.acquisition.roas, "x")}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8b949e]">Cost Health</p>
              <p className="mt-1 font-mono text-lg text-[#e6edf3]">
                {data.acquisition.missingExactCostSources.length}
              </p>
              <p className="text-xs text-[#8b949e]">channels need exact spend</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[#8b949e]">
            Cost basis: {formatCurrency(data.acquisition.exactMarketingCost)} exact campaign/lead cost,
            {" "}{formatCurrency(data.acquisition.recurringMarketingCost + data.acquisition.oneTimeMarketingCost)} allocated marketing budget.
            {data.acquisition.missingExactCostSources.length > 0 && (
              <> Missing exact spend for {data.acquisition.missingExactCostSources.join(", ")}.</>
            )}
          </p>
        </div>
      )}

      {/* Lead Volume Horizontal Bar Chart */}
      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <Skeleton className="h-4 w-48 bg-[#21262d] mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-28 bg-[#21262d]" />
                <Skeleton
                  className="h-5 bg-[#21262d] rounded"
                  style={{ width: `${100 - i * 15}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Lead Volume by Source
          </h2>
          {barChartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center border border-dashed border-[#30363d] rounded-lg">
              <span className="text-sm text-[#8b949e]">
                No lead source data for this period
              </span>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, barChartData.length * 36)}
            >
              <BarChart
                layout="vertical"
                data={barChartData}
                margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
              >
                <XAxis
                  type="number"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="source"
                  tick={{ fill: "#e6edf3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(88,166,255,0.08)" }}
                />
                <Bar
                  dataKey="totalLeads"
                  name="Leads"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                >
                  {barChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Source Performance Table (sortable) */}
      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <Skeleton className="h-4 w-40 bg-[#21262d] mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-28 bg-[#21262d]" />
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <Skeleton key={j} className="h-4 w-14 bg-[#21262d] ml-auto" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Source Performance
          </h2>
          {sortedSources.length === 0 ? (
            <p className="text-sm text-[#8b949e]">
              No source data for this period
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    {(
                      [
                        { key: "source" as SortKey, label: "Source", align: "left" },
                        { key: "totalLeads" as SortKey, label: "Leads", align: "right" },
                        { key: "wonJobs" as SortKey, label: "Won", align: "right" },
                        { key: "lostJobs" as SortKey, label: "Lost", align: "right" },
                        { key: "closeRate" as SortKey, label: "Close Rate", align: "right" },
                        { key: "revenue" as SortKey, label: "Revenue", align: "right" },
                        { key: "avgTicket" as SortKey, label: "Avg Ticket", align: "right" },
                        { key: "acquisitionCost" as SortKey, label: "Cost", align: "right" },
                        { key: "costPerLead" as SortKey, label: "Cost / Lead", align: "right" },
                        { key: "cac" as SortKey, label: "CAC", align: "right" },
                        { key: "roas" as SortKey, label: "ROAS", align: "right" },
                      ] as const
                    ).map((col) => (
                      <th
                        key={col.key}
                        className={`pb-3 font-medium text-[#8b949e] cursor-pointer hover:text-[#e6edf3] transition-colors select-none ${
                          col.align === "left" ? "text-left" : "text-right"
                        }`}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        {sortIndicator(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedSources.map((source) => (
                    <tr
                      key={source.source}
                      className="border-b border-[#21262d] hover:bg-[#21262d]/50 transition-colors"
                    >
                      <td className="py-3 text-[#e6edf3] font-medium">
                        {source.source}
                      </td>
                      <td className="py-3 text-right font-mono text-[#e6edf3]">
                        {source.totalLeads}
                      </td>
                      <td className="py-3 text-right font-mono text-[#3fb950]">
                        {source.wonJobs}
                      </td>
                      <td className="py-3 text-right font-mono text-[#f85149]">
                        {source.lostJobs}
                      </td>
                      <td className="py-3 text-right font-mono text-[#e6edf3]">
                        {formatPercent(source.closeRate)}
                      </td>
                      <td className="py-3 text-right font-mono text-[#e6edf3]">
                        {formatCurrency(source.revenue)}
                      </td>
                      <td className="py-3 text-right font-mono text-[#8b949e]">
                        {formatCurrency(source.avgTicket)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="font-mono text-[#e6edf3]">
                          {formatCurrency(source.acquisitionCost)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-[#8b949e]">
                          {costBasisLabel(source)}
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono text-[#8b949e]">
                        {formatNullableCurrency(source.costPerLead)}
                      </td>
                      <td className="py-3 text-right font-mono text-[#d29922]">
                        {formatNullableCurrency(source.cac)}
                      </td>
                      <td className="py-3 text-right font-mono text-[#8b949e]">
                        {formatNullableNumber(source.roas, "x")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Segment Breakdown Grid */}
      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <Skeleton className="h-4 w-52 bg-[#21262d] mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[#21262d] rounded-lg p-4">
                <Skeleton className="h-4 w-24 bg-[#161b22] mb-3" />
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="flex justify-between">
                      <Skeleton className="h-3 w-20 bg-[#161b22]" />
                      <Skeleton className="h-3 w-6 bg-[#161b22]" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Segment Breakdown by Source
          </h2>
          <p className="text-xs text-[#8b949e] mb-4">
            Top sources feeding into each segment
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(
              Object.entries(SEGMENTS) as [
                Segment,
                (typeof SEGMENTS)[Segment]
              ][]
            ).map(([key, seg]) => {
              const topForSeg = segmentTopSources[key] ?? [];
              return (
                <div key={key} className="bg-[#21262d] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span>{seg.icon}</span>
                    <span
                      className="text-sm font-medium"
                      style={{ color: seg.color }}
                    >
                      {seg.label}
                    </span>
                  </div>
                  {topForSeg.length === 0 ? (
                    <p className="text-xs text-[#484f58]">No data</p>
                  ) : (
                    <div className="space-y-1.5">
                      {topForSeg.map((entry) => (
                        <div
                          key={entry.source}
                          className="flex items-center justify-between"
                        >
                          <span className="text-xs text-[#8b949e] truncate mr-2">
                            {entry.source}
                          </span>
                          <span className="text-xs font-mono text-[#e6edf3]">
                            {entry.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Insights */}
      {!isLoading && (data?.insights ?? []).length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Insights
          </h2>
          <ul className="space-y-2">
            {data!.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#d29922] mt-0.5 shrink-0">*</span>
                <span className="text-sm text-[#e6edf3]">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load lead source data. Check your database connection and
            try again.
          </p>
        </div>
      )}
    </div>
  );
}
