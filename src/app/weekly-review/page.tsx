"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent, formatDate } from "@/lib/dates";
import { CHART_COLORS, SEGMENTS } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

/* -- Types ----------------------------------------------------------------- */

interface SnapshotMetrics {
  period: { start: string; end: string; type: string };
  revenue: number;
  newLeads: number;
  jobsWon: number;
  jobsLost: number;
  closeRate: number;
  avgTicket: number;
  pipelineValue: number;
  avgResponseTimeMinutes: number;
  segments: Record<
    string,
    {
      leads: number;
      won: number;
      lost: number;
      closeRate: number;
      revenue: number;
    }
  >;
  reps: Record<
    string,
    {
      name: string;
      leads: number;
      won: number;
      closeRate: number;
      revenue: number;
      avgResponseMin: number;
    }
  >;
  leadSources: Record<
    string,
    { leads: number; won: number; revenue: number }
  >;
}

interface Snapshot {
  id: string;
  week_start: string;
  week_end: string;
  snapshot_type: string;
  metrics: SnapshotMetrics;
}

interface SnapshotsResponse {
  snapshots: Snapshot[];
}

/* -- Helpers --------------------------------------------------------------- */

function weekLabel(start: string, end: string): string {
  return `${formatDate(start, "MMM d")} - ${formatDate(end, "MMM d")}`;
}

function DeltaArrow({
  current,
  previous,
  format: fmt = "number",
  invertColor = false,
}: {
  current: number;
  previous: number | null;
  format?: "number" | "percent" | "currency";
  invertColor?: boolean;
}) {
  if (previous === null || previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return null;

  const isPositive = diff > 0;
  // For "missed" metrics, positive is bad
  const colorPositive = invertColor ? !isPositive : isPositive;

  let displayVal: string;
  if (fmt === "percent") {
    displayVal = `${Math.abs(diff).toFixed(1)}pp`;
  } else if (fmt === "currency") {
    displayVal = formatCurrency(Math.abs(diff));
  } else {
    displayVal = Math.abs(diff).toFixed(0);
  }

  return (
    <span
      className={`inline-flex items-center text-xs font-medium ${
        colorPositive ? "text-[#3fb950]" : "text-[#f85149]"
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 15l7-7 7 7"
          />
        </svg>
      ) : (
        <svg
          className="w-3 h-3 mr-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      )}
      {displayVal} vs last week
    </span>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
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
            style={{ backgroundColor: CHART_COLORS[i] }}
          />
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

/* -- Skeleton Loaders ------------------------------------------------------ */

function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-4"
        >
          <Skeleton className="h-3 w-16 bg-[#21262d] mb-2" />
          <Skeleton className="h-7 w-20 bg-[#21262d] mb-1" />
          <Skeleton className="h-3 w-24 bg-[#21262d]" />
        </div>
      ))}
    </div>
  );
}

/* -- Main Component -------------------------------------------------------- */

export default function WeeklyReviewPage() {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data, isLoading, isError } = useQuery<SnapshotsResponse>({
    queryKey: ["weekly-snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/snapshots?type=weekly&limit=12");
      if (!res.ok) throw new Error("Failed to fetch weekly snapshots");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      const res = await fetch("/api/snapshots/generate", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate snapshot");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-snapshots"] });
      setGenerating(false);
    },
    onError: () => {
      setGenerating(false);
    },
  });

  const snapshots = data?.snapshots ?? [];
  const current = snapshots[0] ?? null;
  const previous = snapshots[1] ?? null;

  // Revenue trend chart data (reversed for chronological order)
  const revenueTrend = [...snapshots]
    .reverse()
    .map((s) => ({
      week: formatDate(s.week_start, "MMM d"),
      revenue: s.metrics.revenue,
    }));

  // -- Empty State --
  if (!isLoading && snapshots.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">
          Weekly Review
        </h1>
        <p className="text-[#8b949e] mb-8">
          Week-over-week snapshots — compare revenue, leads, close rates, and
          rep performance across time periods.
        </p>
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-[#e6edf3] mb-2">
            No weekly snapshots yet
          </h2>
          <p className="text-sm text-[#8b949e] mb-6 max-w-md mx-auto">
            Snapshots are generated every Sunday. You can also generate one now
            to capture the current week&apos;s performance.
          </p>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generating}
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-0"
          >
            {generating ? "Generating..." : "Generate Now"}
          </Button>
          {generateMutation.isError && (
            <p className="text-sm text-[#f85149] mt-4">
              Failed to generate snapshot. Please try again.
            </p>
          )}
        </div>
      </div>
    );
  }

  const cm = current?.metrics;
  const pm = previous?.metrics ?? null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Weekly Review
          </h1>
          <p className="text-[#8b949e]">
            Week-over-week snapshots — compare revenue, leads, close rates, and
            rep performance across time periods.
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generating}
          variant="outline"
          className="bg-[#161b22] border-[#30363d] text-[#e6edf3] hover:bg-[#21262d] hover:text-[#e6edf3]"
        >
          {generating ? "Generating..." : "Generate Snapshot"}
        </Button>
      </div>

      {/* Current Week Label */}
      {current && !isLoading && (
        <div className="mb-4">
          <span className="text-sm font-medium text-[#58a6ff]">
            {weekLabel(current.week_start, current.week_end)}
          </span>
        </div>
      )}

      {/* WoW Comparison KPIs */}
      {isLoading ? (
        <KPISkeleton />
      ) : cm ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Revenue</p>
            <p className="text-xl font-bold text-[#e6edf3]">
              {formatCurrency(cm.revenue)}
            </p>
            <DeltaArrow
              current={cm.revenue}
              previous={pm?.revenue ?? null}
              format="currency"
            />
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">New Leads</p>
            <p className="text-xl font-bold text-[#e6edf3]">{cm.newLeads}</p>
            <DeltaArrow
              current={cm.newLeads}
              previous={pm?.newLeads ?? null}
            />
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Jobs Won</p>
            <p className="text-xl font-bold text-[#3fb950]">{cm.jobsWon}</p>
            <DeltaArrow
              current={cm.jobsWon}
              previous={pm?.jobsWon ?? null}
            />
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Jobs Lost</p>
            <p className="text-xl font-bold text-[#f85149]">{cm.jobsLost}</p>
            <DeltaArrow
              current={cm.jobsLost}
              previous={pm?.jobsLost ?? null}
              invertColor
            />
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Close Rate</p>
            <p className="text-xl font-bold text-[#e6edf3]">
              {formatPercent(cm.closeRate)}
            </p>
            <DeltaArrow
              current={cm.closeRate}
              previous={pm?.closeRate ?? null}
              format="percent"
            />
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Avg Ticket</p>
            <p className="text-xl font-bold text-[#e6edf3]">
              {formatCurrency(cm.avgTicket)}
            </p>
            <DeltaArrow
              current={cm.avgTicket}
              previous={pm?.avgTicket ?? null}
              format="currency"
            />
          </div>
        </div>
      ) : null}

      {/* Revenue Trend Bar Chart */}
      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <Skeleton className="h-4 w-48 bg-[#21262d] mb-4" />
          <Skeleton className="h-48 w-full bg-[#21262d] rounded" />
        </div>
      ) : revenueTrend.length > 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Revenue Trend ({revenueTrend.length} Weeks)
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={revenueTrend}
              margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
            >
              <XAxis
                dataKey="week"
                tick={{ fill: "#8b949e", fontSize: 11 }}
                axisLine={{ stroke: "#30363d" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#8b949e", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(88,166,255,0.08)" }}
              />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={CHART_COLORS[0]}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Segment Performance Cards */}
      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <Skeleton className="h-4 w-52 bg-[#21262d] mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[#21262d] rounded-lg p-4">
                <Skeleton className="h-4 w-24 bg-[#161b22] mb-3" />
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j}>
                      <Skeleton className="h-3 w-10 bg-[#161b22] mb-1" />
                      <Skeleton className="h-4 w-8 bg-[#161b22]" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : cm?.segments ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Segment Performance (Current Week)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(
              Object.entries(SEGMENTS) as [
                Segment,
                (typeof SEGMENTS)[Segment]
              ][]
            ).map(([key, seg]) => {
              const segData = cm.segments?.[key];
              return (
                <div
                  key={key}
                  className="bg-[#21262d] rounded-lg p-4 border-l-2"
                  style={{ borderLeftColor: seg.color }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{seg.icon}</span>
                    <span className="text-sm font-medium text-[#e6edf3]">
                      {seg.label}
                    </span>
                  </div>
                  {segData ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[#8b949e]">Leads</p>
                        <p className="font-mono text-[#e6edf3]">
                          {segData.leads}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#8b949e]">Won</p>
                        <p className="font-mono text-[#3fb950]">
                          {segData.won}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#8b949e]">Close %</p>
                        <p className="font-mono text-[#e6edf3]">
                          {formatPercent(segData.closeRate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#8b949e]">Revenue</p>
                        <p className="font-mono text-[#e6edf3]">
                          {formatCurrency(segData.revenue)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#484f58]">No data this week</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Rep Performance (Current Week) */}
      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <Skeleton className="h-4 w-48 bg-[#21262d] mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-28 bg-[#21262d]" />
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-4 w-14 bg-[#21262d] ml-auto" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : cm?.reps && Object.keys(cm.reps).length > 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Rep Performance (Current Week)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="pb-3 font-medium text-[#8b949e] text-left">
                    Rep
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Leads
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Won
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Close Rate
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Revenue
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Avg Response
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(cm.reps).map(([repId, rep]) => (
                  <tr
                    key={repId}
                    className="border-b border-[#21262d] hover:bg-[#21262d]/50 transition-colors"
                  >
                    <td className="py-3 text-[#e6edf3] font-medium">
                      {rep.name}
                    </td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {rep.leads}
                    </td>
                    <td className="py-3 text-right font-mono text-[#3fb950]">
                      {rep.won}
                    </td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {formatPercent(rep.closeRate)}
                    </td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {formatCurrency(rep.revenue)}
                    </td>
                    <td className="py-3 text-right font-mono text-[#8b949e]">
                      {rep.avgResponseMin.toFixed(1)} min
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Historical Snapshots Table */}
      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <Skeleton className="h-4 w-44 bg-[#21262d] mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-36 bg-[#21262d]" />
                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <Skeleton key={j} className="h-4 w-14 bg-[#21262d] ml-auto" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : snapshots.length > 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Historical Snapshots
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="pb-3 font-medium text-[#8b949e] text-left">
                    Week
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Revenue
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    New Leads
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Won
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Lost
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Close Rate
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Avg Ticket
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Pipeline
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot, idx) => (
                  <tr
                    key={snapshot.id}
                    className={`border-b border-[#21262d] hover:bg-[#21262d]/50 transition-colors ${
                      idx === 0 ? "bg-[#58a6ff]/5" : ""
                    }`}
                  >
                    <td className="py-3">
                      <div>
                        <span className="text-[#e6edf3]">
                          {idx === 0
                            ? "This Week"
                            : idx === 1
                            ? "Last Week"
                            : `${idx} Weeks Ago`}
                        </span>
                        <span className="text-xs text-[#8b949e] ml-2">
                          {weekLabel(snapshot.week_start, snapshot.week_end)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {formatCurrency(snapshot.metrics.revenue)}
                    </td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {snapshot.metrics.newLeads}
                    </td>
                    <td className="py-3 text-right font-mono text-[#3fb950]">
                      {snapshot.metrics.jobsWon}
                    </td>
                    <td className="py-3 text-right font-mono text-[#f85149]">
                      {snapshot.metrics.jobsLost}
                    </td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {formatPercent(snapshot.metrics.closeRate)}
                    </td>
                    <td className="py-3 text-right font-mono text-[#8b949e]">
                      {formatCurrency(snapshot.metrics.avgTicket)}
                    </td>
                    <td className="py-3 text-right font-mono text-[#8b949e]">
                      {formatCurrency(snapshot.metrics.pipelineValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Error State */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load weekly snapshots. Check your database connection and
            try again.
          </p>
        </div>
      )}
    </div>
  );
}
