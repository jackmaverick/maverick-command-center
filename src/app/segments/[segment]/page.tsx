"use client";

import { useState } from "react";
import { useParams, notFound } from "next/navigation";
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
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { PeriodSelector } from "@/components/layout/period-selector";
import { InfoTooltip } from "@/components/InfoTooltip";
import { formatCurrency, formatPercent } from "@/lib/dates";
import { SEGMENTS, STAGES } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

/* -- Types ---------------------------------------------------------------- */

interface SegmentSummary {
  totalJobs: number;
  activeJobs: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  revenue: number;
  avgTicket: number;
  pipelineValue: number;
  avgCycleTimeDays: number;
}

interface RepPerformance {
  repId: string;
  repName: string;
  totalJobs: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  revenue: number;
}

interface LossEntry {
  stage: string;
  rawStatus: string;
  count: number;
  rate: number;
}

interface SpeedMetric {
  from: string;
  to: string;
  avgDays: number;
}

interface SegmentData {
  period: { key: string; label: string; start: string; end: string };
  segment: string;
  summary: SegmentSummary;
  stageCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  repPerformance: RepPerformance[];
  lossAnalysis: LossEntry[];
  speedMetrics: SpeedMetric[];
  companyAvgConversion: number;
  conversionDelta: number;
}

/* -- Slug-to-key mapping -------------------------------------------------- */

const SLUG_TO_SEGMENT: Record<string, Segment> = {
  "real-estate": "real_estate",
  retail: "retail",
  insurance: "insurance",
  repairs: "repairs",
};

/* -- Custom Tooltip ------------------------------------------------------- */

function ChartTooltip({
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
            style={{ backgroundColor: entry.payload?.fill ?? "#58a6ff" }}
          />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

/* -- Delta Badge ---------------------------------------------------------- */

function DeltaBadge({ value, label }: { value: number; label?: string }) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        isPositive
          ? "bg-green-500/10 text-green-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      {isPositive ? (
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {Math.abs(value).toFixed(1)}%{label ? ` ${label}` : ""}
    </span>
  );
}

/* -- Skeleton blocks ------------------------------------------------------ */

function KpiSkeleton() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <Skeleton className="h-3 w-16 bg-[#21262d] mb-2" />
      <Skeleton className="h-7 w-20 bg-[#21262d]" />
    </div>
  );
}

function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <TableRow className="border-[#21262d]">
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton
            className={`h-4 bg-[#21262d] ${i === 0 ? "w-24" : "w-12 ml-auto"}`}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

/* -- Main Component ------------------------------------------------------- */

export default function SegmentPage() {
  const params = useParams<{ segment: string }>();
  const slug = params.segment;
  const segmentKey = SLUG_TO_SEGMENT[slug];

  const [period, setPeriod] = useState("month");

  // Must call hooks before conditional returns, so check after
  const { data, isLoading, isError } = useQuery<SegmentData>({
    queryKey: ["segment", segmentKey, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/segments?segment=${segmentKey}&period=${period}`
      );
      if (!res.ok) throw new Error("Failed to fetch segment data");
      return res.json();
    },
    enabled: !!segmentKey,
  });

  if (!segmentKey) {
    notFound();
  }

  const seg = SEGMENTS[segmentKey];
  const summary = data?.summary;

  // Prepare stage pipeline chart data
  const stageChartData = STAGES.map((stage) => ({
    name: stage,
    value: data?.stageCounts?.[stage] ?? 0,
    fill: seg.color,
  }));
  const maxStageCount = Math.max(1, ...stageChartData.map((d) => d.value));

  // Sort reps by revenue descending
  const sortedReps = [...(data?.repPerformance ?? [])].sort(
    (a, b) => b.revenue - a.revenue
  );
  const topRepId = sortedReps[0]?.repId;

  // Conversion funnel: build from stage counts (step-down from Lead to Completed)
  const funnelSteps = STAGES.map((stage, i) => {
    const count = data?.stageCounts?.[stage] ?? 0;
    // cumulative: jobs at this stage or later
    const cumulative = STAGES.slice(i).reduce(
      (sum, s) => sum + (data?.stageCounts?.[s] ?? 0),
      0
    );
    return { stage, count, cumulative };
  });
  const funnelMax = Math.max(1, funnelSteps[0]?.cumulative ?? 1);

  return (
    <div>
      {/* ── 1. Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{seg.icon}</span>
          <h1 className="text-2xl font-bold" style={{ color: seg.color }}>
            {seg.label}
          </h1>
          {data && (
            <DeltaBadge
              value={data.conversionDelta}
              label="vs company avg"
            />
          )}
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      <p className="text-[#8b949e] mb-8 text-sm">
        {data?.period.label ?? "This Month"} &mdash; drill into the{" "}
        {seg.label.toLowerCase()} segment pipeline, revenue, rep performance,
        and conversion rates.
      </p>

      {/* ── 2. KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            {/* Revenue */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <div className="mb-1">
                <InfoTooltip label="Revenue" explanation="Sum of invoice amounts for this segment in the selected period (accrual basis — invoice creation date, not payment received)." />
              </div>
              <p className="text-xl font-bold text-[#e6edf3]">
                {formatCurrency(summary?.revenue ?? 0)}
              </p>
            </div>
            {/* Pipeline Value */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <div className="mb-1">
                <InfoTooltip label="Pipeline Value" explanation="Sum of active estimate totals on open jobs in this segment, from Estimating through Invoiced stages." />
              </div>
              <p className="text-xl font-bold text-[#e6edf3]">
                {formatCurrency(summary?.pipelineValue ?? 0)}
              </p>
            </div>
            {/* Avg Ticket */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <div className="mb-1">
                <InfoTooltip label="Avg Ticket" explanation="Average invoice amount for this segment. Only counts invoices with total > $0." />
              </div>
              <p className="text-xl font-bold text-[#e6edf3]">
                {formatCurrency(summary?.avgTicket ?? 0)}
              </p>
            </div>
            {/* Active Jobs */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <div className="mb-1">
                <InfoTooltip label="Active Jobs" explanation="Non-archived jobs in this segment created during the selected period." />
              </div>
              <p className="text-xl font-bold text-[#e6edf3]">
                {summary?.activeJobs ?? 0}
              </p>
            </div>
            {/* Close Rate */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <div className="mb-1">
                <InfoTooltip label="Close Rate" explanation="Percentage of jobs in this segment reaching Sold Job or beyond. Delta badge shows difference vs company-wide close rate." />
              </div>
              <p className="text-xl font-bold text-[#e6edf3]">
                {formatPercent(summary?.closeRate ?? 0)}
              </p>
              {data && (
                <div className="mt-1">
                  <DeltaBadge value={data.conversionDelta} />
                </div>
              )}
            </div>
            {/* Avg Cycle Time */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <div className="mb-1">
                <InfoTooltip label="Avg Cycle" explanation="Average days from job creation to Sold Job for this segment. Shorter cycles indicate faster-moving deals." />
              </div>
              <p className="text-xl font-bold text-[#e6edf3]">
                {summary?.avgCycleTimeDays ?? 0} days
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── 3. Stage Pipeline ────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Pipeline by Stage
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {STAGES.map((s) => (
              <Skeleton key={s} className="h-6 bg-[#21262d]" />
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              layout="vertical"
              data={stageChartData}
              margin={{ top: 0, right: 30, bottom: 0, left: 10 }}
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
                dataKey="name"
                tick={{ fill: "#e6edf3", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "rgba(88,166,255,0.08)" }}
              />
              <Bar
                dataKey="value"
                name="Jobs"
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
              >
                {stageChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={seg.color}
                    fillOpacity={1 - i * 0.12}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── 4. Rep Performance + 5. Conversion Funnel ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Rep Performance Table */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Rep Performance ({seg.label})
          </h2>
          <Table>
            <TableHeader>
              <TableRow className="border-[#30363d] hover:bg-transparent">
                <TableHead className="text-[#8b949e] text-xs font-medium">
                  Rep
                </TableHead>
                <TableHead className="text-[#8b949e] text-xs font-medium text-right">
                  Jobs
                </TableHead>
                <TableHead className="text-[#8b949e] text-xs font-medium text-right">
                  Won
                </TableHead>
                <TableHead className="text-[#8b949e] text-xs font-medium text-right">
                  Lost
                </TableHead>
                <TableHead className="text-[#8b949e] text-xs font-medium text-right">
                  Close %
                </TableHead>
                <TableHead className="text-[#8b949e] text-xs font-medium text-right">
                  Revenue
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={6} />
                ))
              ) : sortedReps.length === 0 ? (
                <TableRow className="border-[#21262d]">
                  <TableCell
                    colSpan={6}
                    className="text-center text-[#8b949e] text-sm py-8"
                  >
                    No rep data for this period
                  </TableCell>
                </TableRow>
              ) : (
                sortedReps.map((rep) => {
                  const isBest = rep.repId === topRepId;
                  return (
                    <TableRow
                      key={rep.repId}
                      className={`border-[#21262d] ${
                        isBest ? "bg-[#1c2333]" : ""
                      }`}
                    >
                      <TableCell className="text-[#e6edf3] text-sm">
                        <div className="flex items-center gap-2">
                          {rep.repName}
                          {isBest && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${seg.color}20`,
                                color: seg.color,
                              }}
                            >
                              TOP
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[#e6edf3] text-sm text-right font-mono">
                        {rep.totalJobs}
                      </TableCell>
                      <TableCell className="text-green-400 text-sm text-right font-mono">
                        {rep.wonJobs}
                      </TableCell>
                      <TableCell className="text-red-400 text-sm text-right font-mono">
                        {rep.lostJobs}
                      </TableCell>
                      <TableCell className="text-[#e6edf3] text-sm text-right font-mono">
                        {formatPercent(rep.closeRate)}
                      </TableCell>
                      <TableCell className="text-[#e6edf3] text-sm text-right font-mono">
                        {formatCurrency(rep.revenue)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Conversion Funnel */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Conversion Funnel
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {STAGES.map((s) => (
                <Skeleton key={s} className="h-8 bg-[#21262d]" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {funnelSteps.map((step, i) => {
                const pct = (step.cumulative / funnelMax) * 100;
                const convRate =
                  i === 0
                    ? 100
                    : funnelSteps[i - 1].cumulative > 0
                      ? (step.cumulative / funnelSteps[i - 1].cumulative) * 100
                      : 0;
                return (
                  <div key={step.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#e6edf3]">
                        {step.stage}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-[#8b949e]">
                          {step.cumulative} jobs
                        </span>
                        {i > 0 && (
                          <span
                            className="text-xs font-mono"
                            style={{ color: seg.color }}
                          >
                            {convRate.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-5 bg-[#21262d] rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: seg.color,
                          opacity: 1 - i * 0.12,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 6. Speed Metrics + 7. Loss Analysis ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Speed Metrics */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">
            Speed Metrics
          </h2>
          <p className="text-xs text-[#8b949e] mb-4">
            Average days between status transitions
          </p>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 bg-[#21262d]" />
              ))}
            </div>
          ) : (data?.speedMetrics ?? []).length === 0 ? (
            <p className="text-sm text-[#8b949e] py-4 text-center">
              No speed data for this period
            </p>
          ) : (
            <div className="space-y-2">
              {data!.speedMetrics.map((metric) => {
                const maxDays = Math.max(
                  1,
                  ...data!.speedMetrics.map((m) => m.avgDays)
                );
                const barPct = (metric.avgDays / maxDays) * 100;
                return (
                  <div
                    key={`${metric.from}-${metric.to}`}
                    className="relative bg-[#21262d] rounded px-3 py-2.5 overflow-hidden"
                  >
                    {/* Background bar */}
                    <div
                      className="absolute inset-y-0 left-0 rounded opacity-15"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: seg.color,
                      }}
                    />
                    <div className="relative flex items-center justify-between">
                      <span className="text-xs text-[#e6edf3]">
                        {metric.from} &rarr; {metric.to}
                      </span>
                      <span
                        className="text-xs font-mono font-medium"
                        style={{ color: seg.color }}
                      >
                        {metric.avgDays} days
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Loss Analysis */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">
            Loss Analysis
          </h2>
          <p className="text-xs text-[#8b949e] mb-4">
            Where {seg.label.toLowerCase()} jobs drop off in the pipeline
          </p>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 bg-[#21262d]" />
              ))}
            </div>
          ) : (data?.lossAnalysis ?? []).length === 0 ? (
            <p className="text-sm text-[#8b949e] py-4 text-center">
              No losses recorded for this period
            </p>
          ) : (
            <div className="space-y-2">
              {data!.lossAnalysis.map((entry) => (
                <div
                  key={entry.rawStatus}
                  className="relative bg-[#21262d] rounded px-3 py-2.5 overflow-hidden"
                >
                  {/* Background bar showing rate */}
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-[#f85149] opacity-10"
                    style={{ width: `${entry.rate}%` }}
                  />
                  <div className="relative flex items-center justify-between">
                    <span className="text-xs text-[#e6edf3]">
                      {entry.stage}
                      {entry.rawStatus !== entry.stage && (
                        <span className="text-[#484f58] ml-1.5">
                          ({entry.rawStatus})
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-[#8b949e]">
                        {entry.count} lost
                      </span>
                      <span className="text-xs font-mono text-[#f85149] font-medium">
                        {formatPercent(entry.rate)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Error State ──────────────────────────────────────────────── */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load segment data. Check your database connection and try
            again.
          </p>
        </div>
      )}
    </div>
  );
}
