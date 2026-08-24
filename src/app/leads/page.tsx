"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/InfoTooltip";
import { CHART_COLORS } from "@/lib/constants";

interface MonthData {
  month: string;
  monthLabel: string;
  leads: number;
  leadsPriorYear: number;
  yoyDelta: number | null;
}

interface LeadsData {
  months: MonthData[];
  timezone: string;
  generatedAt: string;
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-[#8b949e]">N/A</span>;
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center text-sm font-medium ${
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

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-[#8b949e] mb-1 font-medium">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-[#e6edf3]">
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: entry.dataKey === "leads" ? CHART_COLORS[0] : CHART_COLORS[1] }}
          />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function LeadsPage() {
  const [monthsCount] = useState(6);

  const { data, isLoading, isError } = useQuery<LeadsData>({
    queryKey: ["leads", monthsCount],
    queryFn: async () => {
      const res = await fetch(`/api/leads?months=${monthsCount}`);
      if (!res.ok) throw new Error("Failed to fetch leads data");
      return res.json();
    },
  });

  // Prepare chart data
  const chartData = data?.months.map((m) => ({
    month: m.monthLabel.split(" ")[0], // Just month name for chart
    fullLabel: m.monthLabel,
    leads: m.leads,
    leadsPriorYear: m.leadsPriorYear,
  })) ?? [];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
          Leads by Month
        </h1>
        <p className="text-[#8b949e] text-sm">
          Total leads created per month with year-over-year comparison (America/Chicago timezone)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Total Leads (6 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {data?.months.reduce((sum, m) => sum + m.leads, 0) ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              Prior Year (6 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {data?.months.reduce((sum, m) => sum + m.leadsPriorYear, 0) ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              YoY Change
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20 bg-[#21262d]" />
            ) : (() => {
              const totalLeads = data?.months.reduce((sum, m) => sum + m.leads, 0) ?? 0;
              const totalPriorYear = data?.months.reduce((sum, m) => sum + m.leadsPriorYear, 0) ?? 0;
              const yoyChange = totalPriorYear > 0 
                ? ((totalLeads - totalPriorYear) / totalPriorYear) * 100 
                : totalLeads > 0 ? 100 : 0;
              return (
                <div className="text-2xl font-bold text-[#e6edf3]">
                  <DeltaBadge value={yoyChange} />
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Monthly Lead Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center">
              <Skeleton className="h-40 w-full bg-[#21262d]" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fill: "#8b949e", fontSize: 12 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: "#8b949e", fontSize: 12 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(88,166,255,0.08)" }} />
                <Legend 
                  wrapperStyle={{ paddingTop: "20px" }}
                  formatter={(value: string) => (
                    <span className="text-xs text-[#8b949e]">
                      {value === "leads" ? "Current Year" : "Prior Year"}
                    </span>
                  )}
                />
                <Bar 
                  dataKey="leads" 
                  name="Current Year" 
                  fill={CHART_COLORS[0]} 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar 
                  dataKey="leadsPriorYear" 
                  name="Prior Year" 
                  fill={CHART_COLORS[1]} 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-[#161b22] border-[#30363d]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Monthly Breakdown
            </CardTitle>
            <InfoTooltip 
              label="Lead Definition" 
              explanation="Jobs created in month (active, non-archived, non-test). Same definition as Dashboard New Leads."
            >
              <span className="text-xs text-[#8b949e] cursor-help">
                ℹ️ What counts as a lead?
              </span>
            </InfoTooltip>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-12 bg-[#21262d]" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d] text-left">
                    <th className="pb-3 pr-4 text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                      Month
                    </th>
                    <th className="pb-3 pr-4 text-right text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                      Current Year
                    </th>
                    <th className="pb-3 pr-4 text-right text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                      Prior Year
                    </th>
                    <th className="pb-3 text-right text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                      YoY Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.months.map((month) => (
                    <tr key={month.month} className="border-b border-[#21262d] last:border-0">
                      <td className="py-3 pr-4 text-[#e6edf3] font-medium">
                        {month.monthLabel}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[#e6edf3]">
                        {month.leads}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[#8b949e]">
                        {month.leadsPriorYear}
                      </td>
                      <td className="py-3 text-right">
                        <DeltaBadge value={month.yoyDelta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error State */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load leads data. Check your database connection and try again.
          </p>
        </div>
      )}

      {/* Timezone Note */}
      {data && (
        <p className="text-xs text-[#8b949e] mt-4 text-center">
          All dates use {data.timezone} timezone. Month boundaries are based on America/Chicago.
        </p>
      )}
    </div>
  );
}
