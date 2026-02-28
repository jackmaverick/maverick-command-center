"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/dates";
import { CHART_COLORS } from "@/lib/constants";
import type { PnLMetrics } from "@/types";

type Period = "month" | "quarter" | "ytd";

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center text-xs font-medium ${
        isPositive ? "text-green-400" : "text-red-400"
      }`}
    >
      {isPositive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

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
      {label && <p className="text-[#8b949e] mb-1">{label}</p>}
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

export default function PnLPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const { data, isLoading, isError } = useQuery<PnLMetrics>({
    queryKey: ["pnl", period],
    queryFn: async () => {
      const res = await fetch(`/api/financial/pnl?period=${period}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch P&L");
      }
      return res.json();
    },
  });

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Profit & Loss
          </h1>
          <p className="text-sm text-[#8b949e]">
            Financial performance from QuickBooks Online
          </p>
        </div>
        <div className="flex gap-1 bg-[#161b22] border border-[#30363d] rounded-lg p-1">
          {(["month", "quarter", "ytd"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {p === "month" ? "Month" : p === "quarter" ? "Quarter" : "YTD"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-2xl font-bold text-[#3fb950]">
                  {formatCurrency(data?.revenue ?? 0)}
                </p>
                <DeltaBadge value={data?.revenueDelta ?? null} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-2xl font-bold text-[#f85149]">
                  {formatCurrency(Math.abs(data?.expenses ?? 0))}
                </p>
                <DeltaBadge value={data?.expensesDelta ?? null} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Net Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <div>
                <p
                  className={`text-2xl font-bold ${
                    (data?.netIncome ?? 0) >= 0
                      ? "text-[#3fb950]"
                      : "text-[#f85149]"
                  }`}
                >
                  {formatCurrency(data?.netIncome ?? 0)}
                </p>
                <DeltaBadge value={data?.netIncomeDelta ?? null} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend Chart */}
      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Monthly Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center">
              <Skeleton className="h-full w-full bg-[#21262d]" />
            </div>
          ) : !data?.monthlyTrend?.length ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-sm text-[#8b949e]">No monthly data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.monthlyTrend}>
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
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
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="#3fb950"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="expenses"
                  name="Expenses"
                  fill="#f85149"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Line
                  type="monotone"
                  dataKey="netIncome"
                  name="Net Income"
                  stroke="#58a6ff"
                  strokeWidth={2}
                  dot={{ fill: "#58a6ff", r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* YoY Comparison */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Year-over-Year
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20 w-full bg-[#21262d]" />
            ) : data?.yoyComparison ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#8b949e] mb-1">This Year</p>
                    <p className="text-lg font-bold text-[#e6edf3]">
                      {formatCurrency(data.yoyComparison.current)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#8b949e] mb-1">Last Year</p>
                    <p className="text-lg font-bold text-[#8b949e]">
                      {formatCurrency(data.yoyComparison.previous)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        data.yoyComparison.delta >= 0
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                      style={{
                        width: `${Math.min(Math.abs(data.yoyComparison.delta), 100)}%`,
                      }}
                    />
                  </div>
                  <DeltaBadge value={data.yoyComparison.delta} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#8b949e]">No comparison data</p>
            )}
          </CardContent>
        </Card>

        {/* Expense Categories */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Expense Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-full bg-[#21262d]" />
                ))}
              </div>
            ) : !data?.expenseCategories?.length ? (
              <p className="text-sm text-[#8b949e]">No expense data</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {data.expenseCategories.map((cat, i) => (
                  <div key={cat.name}>
                    <button
                      onClick={() =>
                        cat.subcategories?.length
                          ? toggleCategory(cat.name)
                          : undefined
                      }
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {cat.subcategories?.length ? (
                            <span className="text-[#8b949e] text-xs">
                              {expandedCategories.has(cat.name) ? "▾" : "▸"}
                            </span>
                          ) : (
                            <span className="w-3" />
                          )}
                          <span className="text-sm text-[#e6edf3] truncate">
                            {cat.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#8b949e]">
                            {cat.percent}%
                          </span>
                          <span className="text-sm font-mono text-[#e6edf3] tabular-nums">
                            {formatCurrency(Math.abs(cat.amount))}
                          </span>
                        </div>
                      </div>
                      <div className="ml-5 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${cat.percent}%`,
                            backgroundColor:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </button>
                    {expandedCategories.has(cat.name) &&
                      cat.subcategories?.map((sub) => (
                        <div
                          key={sub.name}
                          className="flex items-center justify-between ml-8 mt-1.5 text-xs"
                        >
                          <span className="text-[#8b949e] truncate">
                            {sub.name}
                          </span>
                          <span className="text-[#8b949e] font-mono tabular-nums">
                            {formatCurrency(Math.abs(sub.amount))}
                          </span>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Not Connected State */}
      {isError && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 text-center">
          <p className="text-sm text-yellow-400 mb-2">
            Unable to load P&L data. QuickBooks may not be connected.
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
