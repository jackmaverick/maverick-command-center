"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodSelector } from "@/components/layout/period-selector";
import { formatCurrency, formatPercent } from "@/lib/dates";
import { STAGES, SEGMENTS, CHART_COLORS } from "@/lib/constants";
import type { Stage, Segment } from "@/lib/constants";

/* ── Types ────────────────────────────────────────────────────────────── */

interface StageCount {
  stage: Stage;
  count: number;
}

interface KeyConversion {
  from: string;
  to: string;
  rate: number;
  fromCount: number;
  toCount: number;
}

interface LossByStage {
  stage: string;
  count: number;
  rate: number;
}

interface PipelineValueByStage {
  stage: Stage;
  value: number;
}

interface SegmentComparison {
  segment: Segment;
  activeJobs: number;
  overallConversion: number;
  avgCycleTimeDays: number | null;
  pipelineValue: number;
  revenue: number;
  leadToEstimateRate: number;
  estimateToSoldRate: number;
  soldToInvoicedRate: number;
}

interface PipelineData {
  period: { key: string; label: string; start: string; end: string };
  segment: Segment | null;
  stageCounts: StageCount[];
  overallConversion: {
    rate: number;
    convertedJobs: number;
    totalJobs: number;
  };
  keyConversions: KeyConversion[];
  lossByStage: LossByStage[];
  lostJobsCount: number;
  avgCycleTimeDays: number | null;
  pipelineValueByStage: PipelineValueByStage[];
  segmentComparison: SegmentComparison[];
  revenueInPeriod: number;
}

/* ── Stage colors ─────────────────────────────────────────────────────── */

const STAGE_COLORS: Record<string, string> = {
  Lead: "#58a6ff",
  "Appointment Scheduled": "#79c0ff",
  Estimating: "#a371f7",
  Sold: "#d29922",
  Production: "#f0883e",
  Invoicing: "#3fb950",
  Completed: "#8b949e",
};

/* ── Custom Tooltip ───────────────────────────────────────────────────── */

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
            style={{
              backgroundColor: entry.payload?.fill ?? CHART_COLORS[i],
            }}
          />
          {entry.name}:{" "}
          {typeof entry.value === "number" && entry.value > 100
            ? formatCurrency(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────── */

export default function PipelinePage() {
  const [period, setPeriod] = useState("month");
  const [segment, setSegment] = useState<string>("all");

  const segmentParam = segment === "all" ? "" : `&segment=${segment}`;

  const { data, isLoading, isError } = useQuery<PipelineData>({
    queryKey: ["pipeline", period, segment],
    queryFn: async () => {
      const res = await fetch(
        `/api/pipeline?period=${period}${segmentParam}`
      );
      if (!res.ok) throw new Error("Failed to fetch pipeline data");
      return res.json();
    },
  });

  // Derived values
  const totalOpportunities =
    data?.stageCounts.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const totalPipelineValue =
    data?.pipelineValueByStage.reduce((sum, s) => sum + s.value, 0) ?? 0;
  const soldProductionCount = data?.stageCounts
    .filter((s) => ["Sold", "Production", "Invoicing", "Completed"].includes(s.stage))
    .reduce((sum, s) => sum + s.count, 0) ?? 0;
  const maxStageCount = data
    ? Math.max(...data.stageCounts.map((s) => s.count), 1)
    : 1;

  // Bar chart data for pipeline value by stage
  const valueChartData =
    data?.pipelineValueByStage.map((s) => ({
      name: s.stage,
      value: s.value,
      fill: STAGE_COLORS[s.stage] ?? CHART_COLORS[0],
    })) ?? [];

  // Bar chart data for loss analysis
  const lossChartData =
    data?.lossByStage.map((l, i) => ({
      name: l.stage,
      count: l.count,
      rate: l.rate,
      fill: CHART_COLORS[5], // red
    })) ?? [];

  return (
    <div>
      {/* ── 1. Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Pipeline Overview
          </h1>
          <p className="text-[#8b949e] text-sm">
            Job pipeline by workflow stage — track active jobs from lead to
            completion.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="w-[160px] bg-[#161b22] border-[#30363d] text-[#e6edf3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#161b22] border-[#30363d]">
              <SelectItem
                value="all"
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
              >
                All Segments
              </SelectItem>
              {(
                Object.entries(SEGMENTS) as [
                  Segment,
                  (typeof SEGMENTS)[Segment],
                ][]
              ).map(([key, seg]) => (
                <SelectItem
                  key={key}
                  value={key}
                  className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
                >
                  {seg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ── 2. KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {/* Opportunities (Pre-sale) */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {totalOpportunities}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Sold/Production */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Sold/Production
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {soldProductionCount}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Value */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Pipeline Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {formatCurrency(totalPipelineValue)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Avg Cycle Time */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Avg Cycle Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {data?.avgCycleTimeDays !== null
                  ? `${data?.avgCycleTimeDays} days`
                  : "-- days"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Overall Close Rate */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Overall Close Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-2xl font-bold text-[#e6edf3]">
                  {formatPercent(data?.overallConversion.rate ?? 0)}
                </p>
                <p className="text-xs text-[#8b949e] mt-0.5">
                  {data?.overallConversion.convertedJobs ?? 0} /{" "}
                  {data?.overallConversion.totalJobs ?? 0} jobs
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Stage Pipeline Visualization (Funnel) + Lost Count ───── */}
      <div className="mb-8">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-4">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-6">
            Stage Pipeline
          </h2>
        {isLoading ? (
          <div className="space-y-4">
            {STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-4">
                <span className="text-xs text-[#8b949e] w-24">{stage}</span>
                <Skeleton
                  className="h-8 bg-[#21262d] rounded"
                  style={{ width: `${90 - i * 12}%` }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {data?.stageCounts.map((entry) => {
              const widthPct =
                maxStageCount > 0
                  ? Math.max((entry.count / maxStageCount) * 100, 2)
                  : 2;
              const color = STAGE_COLORS[entry.stage] ?? CHART_COLORS[0];
              return (
                <div key={entry.stage} className="flex items-center gap-4">
                  <span className="text-xs text-[#8b949e] w-24 shrink-0">
                    {entry.stage}
                  </span>
                  <div className="flex-1 relative">
                    <div
                      className="h-9 rounded-md flex items-center px-3 transition-all duration-500"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: color,
                        minWidth: "40px",
                      }}
                    >
                      <span className="text-xs font-bold text-white drop-shadow-sm">
                        {entry.count}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

        {/* Lost/Cold/Dead Count */}
        {!isLoading && (data?.lostJobsCount ?? 0) > 0 && (
          <div className="inline-block bg-[#21262d] border border-[#30363d] rounded-lg px-4 py-2">
            <p className="text-sm font-semibold text-[#f85149]">
              Lost This Period: {data?.lostJobsCount ?? 0} jobs
            </p>
          </div>
        )}
      </div>

      {/* ── 4. Key Conversions ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {isLoading
          ? [1, 2, 3].map((i) => (
              <Card key={i} className="bg-[#161b22] border-[#30363d]">
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-40 mb-3 bg-[#21262d]" />
                  <Skeleton className="h-10 w-20 mb-2 bg-[#21262d]" />
                  <Skeleton className="h-3 w-28 bg-[#21262d]" />
                </CardContent>
              </Card>
            ))
          : data?.keyConversions.map((conv, i) => {
              const color =
                conv.rate >= 60
                  ? "text-green-400"
                  : conv.rate >= 40
                    ? "text-yellow-400"
                    : "text-red-400";
              return (
                <Card key={i} className="bg-[#161b22] border-[#30363d]">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-[#e6edf3]">
                        {conv.from}
                      </span>
                      <svg
                        className="w-4 h-4 text-[#484f58]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                      <span className="text-xs text-[#e6edf3]">{conv.to}</span>
                    </div>
                    <p className={`text-3xl font-bold ${color}`}>
                      {formatPercent(conv.rate)}
                    </p>
                    <p className="text-xs text-[#8b949e] mt-1">
                      {conv.fromCount} &rarr; {conv.toCount} jobs
                    </p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* ── 5 & 6. Pipeline Value + Loss Analysis ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Pipeline Value by Stage */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Pipeline Value by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton
                    key={i}
                    className="h-6 bg-[#21262d]"
                    style={{ width: `${100 - i * 10}%` }}
                  />
                ))}
              </div>
            ) : valueChartData.every((d) => d.value === 0) ? (
              <div className="flex items-center justify-center h-[250px]">
                <p className="text-sm text-[#8b949e]">
                  No pipeline value data for this period
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  layout="vertical"
                  data={valueChartData}
                  margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: "#8b949e", fontSize: 11 }}
                    axisLine={{ stroke: "#30363d" }}
                    tickLine={false}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#e6edf3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-lg">
                          <p className="text-[#8b949e] mb-1">{label}</p>
                          <p className="text-[#e6edf3] font-medium">
                            {formatCurrency(payload[0].value as number)}
                          </p>
                        </div>
                      );
                    }}
                    cursor={{ fill: "rgba(88,166,255,0.08)" }}
                  />
                  <Bar
                    dataKey="value"
                    name="Value"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  >
                    {valueChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Loss Analysis */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Loss Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 bg-[#21262d] rounded" />
                ))}
              </div>
            ) : (data?.lossByStage ?? []).length === 0 ? (
              <div className="flex items-center justify-center h-[250px]">
                <p className="text-sm text-[#8b949e]">
                  No lost jobs in this period
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-[#8b949e] mb-4">
                  Where jobs are lost in the pipeline
                </p>
                {lossChartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={lossChartData}
                      margin={{ top: 0, right: 10, bottom: 0, left: 10 }}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#8b949e", fontSize: 10 }}
                        axisLine={{ stroke: "#30363d" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#8b949e", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0].payload;
                          return (
                            <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-lg">
                              <p className="text-[#e6edf3] font-medium">
                                {item.name}
                              </p>
                              <p className="text-[#f85149]">
                                {item.count} jobs lost (
                                {formatPercent(item.rate)})
                              </p>
                            </div>
                          );
                        }}
                        cursor={{ fill: "rgba(248,81,73,0.08)" }}
                      />
                      <Bar
                        dataKey="count"
                        name="Lost"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      >
                        {lossChartData.map((_, i) => (
                          <Cell key={i} fill="#f85149" fillOpacity={0.7} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-4 space-y-2">
                  {data?.lossByStage.map((loss) => (
                    <div
                      key={loss.stage}
                      className="flex items-center justify-between bg-[#21262d] rounded-lg px-4 py-2.5"
                    >
                      <span className="text-sm text-[#e6edf3]">
                        {loss.stage}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-mono text-[#8b949e]">
                          {loss.count} jobs
                        </span>
                        <span className="text-sm font-mono text-[#f85149]">
                          {formatPercent(loss.rate)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 7. Segment Comparison ──────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
        Segment Comparison
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isLoading
          ? Object.keys(SEGMENTS).map((key) => (
              <Card key={key} className="bg-[#161b22] border-[#30363d]">
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-24 mb-4 bg-[#21262d]" />
                  <Skeleton className="h-6 w-16 mb-2 bg-[#21262d]" />
                  <Skeleton className="h-4 w-28 mb-2 bg-[#21262d]" />
                  <Skeleton className="h-4 w-20 mb-2 bg-[#21262d]" />
                  <Skeleton className="h-4 w-24 bg-[#21262d]" />
                </CardContent>
              </Card>
            ))
          : data?.segmentComparison.map((seg) => {
              const meta = SEGMENTS[seg.segment];
              if (!meta) return null;
              return (
                <Card key={seg.segment} className="bg-[#161b22] border-[#30363d]">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span
                        className="text-sm font-semibold"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8b949e]">
                          Active Jobs
                        </span>
                        <span className="text-sm font-bold text-[#e6edf3]">
                          {seg.activeJobs}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8b949e]">
                          Close Rate
                        </span>
                        <span className="text-sm font-bold text-[#e6edf3]">
                          {formatPercent(seg.overallConversion)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8b949e]">
                          Pipeline Value
                        </span>
                        <span className="text-sm font-bold text-[#e6edf3]">
                          {formatCurrency(seg.pipelineValue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8b949e]">Revenue</span>
                        <span className="text-sm font-bold text-[#e6edf3]">
                          {formatCurrency(seg.revenue)}
                        </span>
                      </div>
                      {/* Mini conversion funnel */}
                      <div className="pt-2 border-t border-[#30363d]">
                        <p className="text-[10px] text-[#484f58] uppercase tracking-wider mb-2">
                          Key Conversions
                        </p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#8b949e]">
                              Lead &rarr; Est
                            </span>
                            <span className="text-[10px] font-mono text-[#8b949e]">
                              {formatPercent(seg.leadToEstimateRate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#8b949e]">
                              Est &rarr; Sold
                            </span>
                            <span className="text-[10px] font-mono text-[#8b949e]">
                              {formatPercent(seg.estimateToSoldRate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#8b949e]">
                              Sold &rarr; Inv
                            </span>
                            <span className="text-[10px] font-mono text-[#8b949e]">
                              {formatPercent(seg.soldToInvoicedRate)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* ── Error State ───────────────────────────────────────────── */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load pipeline data. Check your database connection and try
            again.
          </p>
        </div>
      )}
    </div>
  );
}
