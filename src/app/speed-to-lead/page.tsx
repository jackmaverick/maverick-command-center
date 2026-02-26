"use client";

import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSelector } from "@/components/layout/period-selector";
import { CHART_COLORS } from "@/lib/constants";

/* -- Types ----------------------------------------------------------------- */

interface SpeedToLeadPeriod {
  key: string;
  label: string;
}

interface ResponseBucket {
  bucket: string;
  count: number;
  percent: number;
}

interface RepResponseTime {
  repId: string;
  repName: string;
  avgMinutes: number;
  under5MinPercent: number;
  missedPercent: number;
  totalInbound: number;
}

interface PipelineVelocityStep {
  from: string;
  to: string;
  avgDays: number;
}

interface SpeedToLeadData {
  period: SpeedToLeadPeriod;
  summary: {
    totalInbound: number;
    avgResponseMinutes: number;
    respondedUnder5MinPercent: number;
    missedPercent: number;
    totalCycleDays: number;
  };
  responseDistribution: ResponseBucket[];
  repResponseTimes: RepResponseTime[];
  pipelineVelocity: PipelineVelocityStep[];
}

/* -- Helpers --------------------------------------------------------------- */

function formatMinutes(min: number): string {
  if (min < 1) return "<1 min";
  if (min < 60) return `${min.toFixed(1)} min`;
  const hrs = Math.floor(min / 60);
  const remainder = Math.round(min % 60);
  return `${hrs}h ${remainder}m`;
}

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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-4"
        >
          <Skeleton className="h-3 w-20 bg-[#21262d] mb-2" />
          <Skeleton className="h-8 w-24 bg-[#21262d]" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
      <Skeleton className="h-4 w-48 bg-[#21262d] mb-4" />
      <div className="flex items-end gap-3 h-48">
        {[80, 60, 45, 30, 20, 15, 10, 5].map((h, i) => (
          <div key={i} className="flex-1">
            <Skeleton
              className="w-full bg-[#21262d] rounded-t"
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
      <Skeleton className="h-4 w-40 bg-[#21262d] mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-28 bg-[#21262d]" />
            <Skeleton className="h-4 w-16 bg-[#21262d] ml-auto" />
            <Skeleton className="h-4 w-12 bg-[#21262d]" />
            <Skeleton className="h-4 w-12 bg-[#21262d]" />
            <Skeleton className="h-4 w-10 bg-[#21262d]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- Main Component -------------------------------------------------------- */

export default function SpeedToLeadPage() {
  const [period, setPeriod] = useState("month");

  const { data, isLoading, isError } = useQuery<SpeedToLeadData>({
    queryKey: ["speed-to-lead", period],
    queryFn: async () => {
      const res = await fetch(`/api/speed-to-lead?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch speed-to-lead data");
      return res.json();
    },
  });

  const chartData = (data?.responseDistribution ?? []).map((bucket, i) => ({
    ...bucket,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Speed to Lead
          </h1>
          <p className="text-[#8b949e]">
            Response time metrics — how fast leads are contacted and how speed
            correlates with close rates.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <KPISkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Avg Response Time</p>
            <p className="text-2xl font-bold text-[#58a6ff]">
              {formatMinutes(data?.summary.avgResponseMinutes ?? 0)}
            </p>
            <p className="text-xs text-[#484f58] mt-1">
              {data?.summary.totalInbound ?? 0} inbound leads
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Under 5 Min</p>
            <p className="text-2xl font-bold text-[#3fb950]">
              {(data?.summary.respondedUnder5MinPercent ?? 0).toFixed(1)}%
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Missed / No Response</p>
            <p
              className={`text-2xl font-bold ${
                (data?.summary.missedPercent ?? 0) > 10
                  ? "text-[#f85149]"
                  : "text-[#e6edf3]"
              }`}
            >
              {(data?.summary.missedPercent ?? 0).toFixed(1)}%
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Avg Lead to Close</p>
            <p className="text-2xl font-bold text-[#e6edf3]">
              {(data?.summary.totalCycleDays ?? 0).toFixed(1)} days
            </p>
          </div>
        </div>
      )}

      {/* Response Time Distribution Chart */}
      {isLoading ? (
        <ChartSkeleton />
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Response Time Distribution
          </h2>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center border border-dashed border-[#30363d] rounded-lg">
              <span className="text-sm text-[#8b949e]">
                No response distribution data for this period
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
              >
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(88,166,255,0.08)" }}
                />
                <Bar
                  dataKey="count"
                  name="Leads"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Rep Response Times Table */}
      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Rep Response Times
          </h2>
          {(data?.repResponseTimes ?? []).length === 0 ? (
            <p className="text-sm text-[#8b949e]">
              No rep response data for this period
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="pb-3 font-medium text-[#8b949e] text-left">
                      Rep
                    </th>
                    <th className="pb-3 font-medium text-[#8b949e] text-right">
                      Avg Response
                    </th>
                    <th className="pb-3 font-medium text-[#8b949e] text-right">
                      Under 5 Min
                    </th>
                    <th className="pb-3 font-medium text-[#8b949e] text-right">
                      Missed %
                    </th>
                    <th className="pb-3 font-medium text-[#8b949e] text-right">
                      Total Inbound
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.repResponseTimes ?? []).map((rep) => (
                    <tr
                      key={rep.repId}
                      className="border-b border-[#21262d]"
                    >
                      <td className="py-3 text-[#e6edf3] font-medium">
                        {rep.repName}
                      </td>
                      <td className="py-3 text-right font-mono text-[#e6edf3]">
                        {formatMinutes(rep.avgMinutes)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`font-mono ${
                            rep.under5MinPercent >= 50
                              ? "text-[#3fb950]"
                              : rep.under5MinPercent >= 25
                              ? "text-[#d29922]"
                              : "text-[#f85149]"
                          }`}
                        >
                          {rep.under5MinPercent.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`font-mono ${
                            rep.missedPercent > 15
                              ? "text-[#f85149]"
                              : rep.missedPercent > 5
                              ? "text-[#d29922]"
                              : "text-[#3fb950]"
                          }`}
                        >
                          {rep.missedPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-[#8b949e]">
                        {rep.totalInbound}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pipeline Velocity */}
      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-2">
            Pipeline Velocity
          </h2>
          <p className="text-xs text-[#8b949e] mb-4">
            Average time between key pipeline stages
          </p>
          {(data?.pipelineVelocity ?? []).length === 0 ? (
            <p className="text-sm text-[#8b949e]">
              No pipeline velocity data for this period
            </p>
          ) : (
            <div className="space-y-2">
              {(data?.pipelineVelocity ?? []).map((step, i) => {
                const maxDays = Math.max(
                  ...(data?.pipelineVelocity ?? []).map((s) => s.avgDays),
                  1
                );
                const barPct = (step.avgDays / maxDays) * 100;
                return (
                  <div
                    key={`${step.from}-${step.to}`}
                    className="flex items-center gap-3 bg-[#21262d] rounded px-3 py-2"
                  >
                    <span className="text-xs text-[#e6edf3] w-64 shrink-0">
                      {step.from} → {step.to}
                    </span>
                    <div className="flex-1 h-2 bg-[#161b22] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor:
                            CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-[#8b949e] w-16 text-right shrink-0">
                      {step.avgDays.toFixed(1)} days
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load speed-to-lead data. Check your database connection
            and try again.
          </p>
        </div>
      )}
    </div>
  );
}
