"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/dates";
import type { CashFlowMetrics, CashFlowWeek } from "@/types";

type Scenario = "optimistic" | "realistic" | "conservative";
type Horizon = "30" | "60" | "90";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-[#8b949e] mb-1">Week of {label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-[#e6edf3]">
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function CashFlowPage() {
  const [scenario, setScenario] = useState<Scenario>("realistic");
  const [horizon, setHorizon] = useState<Horizon>("90");

  const { data, isLoading, isError } = useQuery<CashFlowMetrics>({
    queryKey: ["cashflow", horizon],
    queryFn: async () => {
      const res = await fetch(`/api/financial/cashflow?horizon=${horizon}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch cash flow");
      }
      return res.json();
    },
  });

  const activeProjections: CashFlowWeek[] =
    data?.scenarios[scenario]?.projections ?? data?.weeklyProjections ?? [];

  // Danger threshold: 2 weeks of burn
  const dangerThreshold = (data?.burnRate ?? 0) / 2;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Cash Flow Forecast
          </h1>
          <p className="text-sm text-[#8b949e]">
            Multi-source projection with collection probability model
          </p>
        </div>
        <div className="flex gap-2">
          {/* Horizon selector */}
          <div className="flex gap-1 bg-[#161b22] border border-[#30363d] rounded-lg p-1">
            {(["30", "60", "90"] as Horizon[]).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  horizon === h
                    ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                    : "text-[#8b949e] hover:text-[#e6edf3]"
                }`}
              >
                {h}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Cash in Bank
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#3fb950]">
                {formatCurrency(data?.currentCash ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Monthly Burn Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#f85149]">
                {formatCurrency(data?.burnRate ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Cash Runway
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <p
                className={`text-2xl font-bold ${
                  (data?.runwayWeeks ?? 0) < 8
                    ? "text-[#f85149]"
                    : (data?.runwayWeeks ?? 0) < 16
                      ? "text-[#d29922]"
                      : "text-[#3fb950]"
                }`}
              >
                {(data?.runwayWeeks ?? 0) > 52
                  ? "52+ weeks"
                  : `${data?.runwayWeeks ?? 0} weeks`}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scenario Toggle */}
      <div className="flex gap-1 bg-[#161b22] border border-[#30363d] rounded-lg p-1 mb-6 w-fit">
        {(["optimistic", "realistic", "conservative"] as Scenario[]).map(
          (s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                scenario === s
                  ? s === "optimistic"
                    ? "bg-green-500/10 text-green-400"
                    : s === "conservative"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-[#58a6ff]/10 text-[#58a6ff]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {s}
            </button>
          )
        )}
      </div>

      {/* Forecast Chart */}
      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Cash Flow Projection
            </CardTitle>
            {data?.scenarios[scenario] && (
              <span className="text-xs text-[#8b949e]">
                Ending balance:{" "}
                <span
                  className={`font-medium ${
                    data.scenarios[scenario].endingCash >= 0
                      ? "text-[#3fb950]"
                      : "text-[#f85149]"
                  }`}
                >
                  {formatCurrency(data.scenarios[scenario].endingCash)}
                </span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[350px] flex items-center justify-center">
              <Skeleton className="h-full w-full bg-[#21262d]" />
            </div>
          ) : !activeProjections.length ? (
            <div className="h-[350px] flex items-center justify-center">
              <p className="text-sm text-[#8b949e]">No projection data</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={activeProjections}>
                <XAxis
                  dataKey="weekStart"
                  tick={{ fill: "#8b949e", fontSize: 10 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-xs text-[#8b949e]">{value}</span>
                  )}
                />
                {dangerThreshold > 0 && (
                  <ReferenceLine
                    y={dangerThreshold}
                    stroke="#f85149"
                    strokeDasharray="4 4"
                    label={{
                      value: "Danger Zone",
                      fill: "#f85149",
                      fontSize: 10,
                      position: "right",
                    }}
                  />
                )}
                <Bar
                  dataKey="inflows"
                  name="Inflows"
                  fill="#3fb950"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  stackId="stack"
                />
                <Bar
                  dataKey="outflows"
                  name="Outflows"
                  fill="#f85149"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  stackId="stack2"
                />
                <Line
                  type="monotone"
                  dataKey="runningBalance"
                  name="Balance"
                  stroke="#58a6ff"
                  strokeWidth={2}
                  dot={{ fill: "#58a6ff", r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Expected Collections Table */}
      <Card className="bg-[#161b22] border-[#30363d]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Expected Collections (Next 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full bg-[#21262d]" />
              ))}
            </div>
          ) : !data?.expectedCollections?.length ? (
            <p className="text-sm text-[#8b949e]">No outstanding invoices</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                      Source
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                      Amount
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                      Days Out
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                      Probability
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                      Weighted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.expectedCollections.map((c, i) => (
                    <tr
                      key={i}
                      className="border-b border-[#21262d] hover:bg-[#21262d]/50"
                    >
                      <td className="py-2 px-2 text-[#e6edf3]">
                        {c.jobName ?? c.source}
                        {c.segment && (
                          <span className="ml-2 text-[10px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded">
                            {c.segment}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-[#e6edf3] font-mono tabular-nums">
                        {formatCurrency(c.amount)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span
                          className={`font-mono tabular-nums ${
                            c.daysOutstanding > 60
                              ? "text-[#f85149]"
                              : c.daysOutstanding > 30
                                ? "text-[#d29922]"
                                : "text-[#8b949e]"
                          }`}
                        >
                          {c.daysOutstanding}d
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-[#8b949e] font-mono tabular-nums">
                        {Math.round(c.probability * 100)}%
                      </td>
                      <td className="py-2 px-2 text-right text-[#3fb950] font-mono tabular-nums">
                        {formatCurrency(c.weightedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#30363d]">
                    <td className="py-2 px-2 font-medium text-[#e6edf3]">
                      Total
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-[#e6edf3]">
                      {formatCurrency(
                        data.expectedCollections.reduce(
                          (s, c) => s + c.amount,
                          0
                        )
                      )}
                    </td>
                    <td />
                    <td />
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-[#3fb950] font-medium">
                      {formatCurrency(
                        data.expectedCollections.reduce(
                          (s, c) => s + c.weightedAmount,
                          0
                        )
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isError && (
        <div className="mt-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 text-center">
          <p className="text-sm text-yellow-400 mb-2">
            Unable to load cash flow data. QuickBooks may not be connected.
          </p>
          <a
            href="/settings"
            className="text-xs text-[#58a6ff] hover:underline"
          >
            Go to Settings to connect QuickBooks
          </a>
        </div>
      )}
    </div>
  );
}
