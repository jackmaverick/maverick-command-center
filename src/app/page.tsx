"use client";

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
        <Card className="bg-[#161b22] border-[#30363d]">
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
              </div>
            )}
          </CardContent>
        </Card>

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
