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
import { InfoTooltip } from "@/components/InfoTooltip";
import { formatCurrency } from "@/lib/dates";
import type { CashFlowMetrics, CashFlowWeek, MonthlySpendResponse } from "@/types";

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

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(1)}%`;
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

  const { data: spendData, isLoading: spendLoading } =
    useQuery<MonthlySpendResponse>({
      queryKey: ["monthly-spend", horizon],
      queryFn: async () => {
        const res = await fetch(
          `/api/financial/monthly-spend?months=24&horizon=${horizon}`
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to fetch monthly spend");
        }
        return res.json();
      },
    });

  const spendChartData = (spendData?.yearOverYear ?? [])
    .filter((m) => m.currentYearTotal !== null || m.priorYearTotal !== null)
    .map((m) => ({
      month: m.monthLabel,
      currentYearTotal: m.currentYearTotal,
      priorYearTotal: m.priorYearTotal,
      variance: m.variance,
      variancePct: m.variancePct,
    }));

  const topCategoriesThisMonth = spendData?.months?.[0]?.categories ?? [];
  const expenseProjection = spendData?.projection;
  const expectedExpenses = expenseProjection?.projectedExpense ?? 0;
  const expectedRevenue = data?.revenueForecast?.projectedRevenue ?? 0;
  const netForecast = expectedRevenue - expectedExpenses;

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

      {/* Forward Model Cards */}
      <div className="grid grid-cols-1 gap-4 mb-8 lg:grid-cols-3">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              <InfoTooltip
                label="Expected Revenue"
                explanation="Equation: weighted AR + weighted sold/post-sold work + weighted Estimate Sent revenue. Estimate Sent is based on historical close rate, average days to close, record type, and inferred trade."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <>
                <p className="text-2xl font-bold text-[#3fb950]">
                  {formatCurrency(expectedRevenue)}
                </p>
                <p className="mt-1 text-xs text-[#8b949e]">
                  AR {formatCurrency(data?.revenueForecast?.arWeighted ?? 0)} + sold work {formatCurrency(data?.revenueForecast?.soldPipelineWeighted ?? 0)} + sent estimates {formatCurrency(data?.revenueForecast?.estimateSentWeighted ?? 0)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              <InfoTooltip
                label="Expected Expenses"
                explanation="Equation: blended monthly expense estimate multiplied by the selected 30/60/90 day horizon. Blended monthly estimate = 50% recent complete-month run-rate + 50% same-period last-year seasonal average."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {spendLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <>
                <p className="text-2xl font-bold text-[#f85149]">
                  {formatCurrency(expectedExpenses)}
                </p>
                <p className="mt-1 text-xs text-[#8b949e]">
                  {formatCurrency(expenseProjection?.blendedMonthlyEstimate ?? 0)} monthly model × {horizon}d
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              <InfoTooltip
                label="Net Forecast"
                explanation="Equation: Expected Revenue minus Expected Expenses for the selected horizon. This is operating forecast, not cash in bank."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || spendLoading ? (
              <Skeleton className="h-8 w-24 bg-[#21262d]" />
            ) : (
              <p
                className={`text-2xl font-bold ${
                  netForecast >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
                }`}
              >
                {formatCurrency(netForecast)}
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

      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e6edf3]">
                Need the JobNimbus pipeline timing view?
              </p>
              <p className="text-xs text-[#8b949e] mt-1">
                See expected cash by Retail, Insurance, Repairs, stuck money, timing curves, and conversion gates.
              </p>
            </div>
            <a
              href="/financial/pipeline-cashflow"
              className="inline-flex w-fit items-center rounded-md border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-3 py-2 text-xs font-medium text-[#58a6ff] hover:bg-[#58a6ff]/15"
            >
              Open Pipeline Cashflow
            </a>
          </div>
        </CardContent>
      </Card>

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

      {/* Estimate Sent Forecast */}
      <div className="grid grid-cols-1 gap-4 mb-8 xl:grid-cols-3">
        <Card className="bg-[#161b22] border-[#30363d] xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              <InfoTooltip
                label="Estimate Sent Revenue Forecast"
                explanation="Equation per row: estimate value × adjusted probability. Base probability is historical close rate for the record type and inferred trade. If current age is past average close days, probability decays by age."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full bg-[#21262d]" />
                ))}
              </div>
            ) : !data?.revenueForecast?.estimateSentGroups?.length ? (
              <p className="text-sm text-[#8b949e]">No open Estimate Sent jobs with value.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#30363d]">
                      <th className="py-2 px-2 text-left font-medium text-[#8b949e]">Cohort</th>
                      <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Sent $</th>
                      <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Close %</th>
                      <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Avg close</th>
                      <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Age</th>
                      <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Weighted $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenueForecast.estimateSentGroups.map((group) => (
                      <tr key={`${group.recordType}-${group.trade}`} className="border-b border-[#21262d]">
                        <td className="py-2 px-2 text-[#e6edf3]">
                          {group.recordType} · {group.trade}
                          <p className="text-[11px] text-[#8b949e]">
                            {group.estimateCount} open, {group.historicalSold}/{group.historicalSent} historical closed, {group.confidence} confidence
                          </p>
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-[#e6edf3]">{formatCurrency(group.estimateValue)}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-[#8b949e]">{formatPercent(group.closeRate)}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-[#8b949e]">{group.avgDaysToClose === null ? "n/a" : `${group.avgDaysToClose}d`}</td>
                        <td className={`py-2 px-2 text-right font-mono tabular-nums ${group.staleCount > 0 ? "text-[#d29922]" : "text-[#8b949e]"}`}>
                          {group.avgCurrentAgeDays}d
                          {group.staleCount > 0 ? ` (${group.staleCount} stale)` : ""}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-[#3fb950]">{formatCurrency(group.weightedRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              <InfoTooltip
                label="How the Estimate Model Updates"
                explanation="This recalculates on every page/API load from live JobNimbus/Supabase data. If a job moves to Sold, it leaves Estimate Sent and strengthens the historical model. If it sits past the average close window, its probability decays and the row flags stale."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-xs text-[#8b949e]">
              {(data?.revenueForecast?.modelNotes ?? []).map((note) => (
                <div key={note} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#58a6ff]" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {data?.revenueForecast?.estimateSentJobs?.length ? (
        <Card className="bg-[#161b22] border-[#30363d] mb-8">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Estimate Sent Jobs Behind the Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="py-2 px-2 text-left font-medium text-[#8b949e]">Job</th>
                    <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Estimate</th>
                    <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Age</th>
                    <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Probability</th>
                    <th className="py-2 px-2 text-right font-medium text-[#8b949e]">Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenueForecast.estimateSentJobs.slice(0, 10).map((job) => (
                    <tr key={job.jobJnid} className="border-b border-[#21262d]">
                      <td className="py-2 px-2 text-[#e6edf3]">
                        <a href={job.jobUrl} target="_blank" rel="noreferrer" className="text-[#58a6ff] hover:underline">
                          {job.jobName}
                        </a>
                        <p className="text-[11px] text-[#8b949e]">{job.recordType} · {job.trade}</p>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[#e6edf3]">{formatCurrency(job.estimateValue)}</td>
                      <td className={`py-2 px-2 text-right font-mono tabular-nums ${job.isPastAverageCloseDays ? "text-[#d29922]" : "text-[#8b949e]"}`}>
                        {job.daysSinceSent}d
                        {job.isPastAverageCloseDays ? " past avg" : ""}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[#8b949e]">
                        {formatPercent(job.probability)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[#3fb950]">{formatCurrency(job.weightedRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Monthly Actual Spend */}
      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-[#e6edf3]">
                Expense Projection Baseline
              </CardTitle>
              <p className="text-xs text-[#8b949e] mt-1">
                Cash-basis spend from QBO purchases, compared against the same
                months last year so the forecast accounts for seasonal expense
                swings.
              </p>
            </div>
            {spendData && (
              <div className="text-right">
                <p className="text-xs text-[#8b949e]">Projected {horizon}d expenses</p>
                <p className="text-sm font-medium text-[#f85149]">
                  {formatCurrency(expenseProjection?.projectedExpense ?? 0)}
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {spendLoading ? (
            <div className="h-[260px] flex items-center justify-center">
              <Skeleton className="h-full w-full bg-[#21262d]" />
            </div>
          ) : !spendChartData.length ? (
            <div className="h-[260px] flex items-center justify-center">
              <p className="text-sm text-[#8b949e]">No purchase data</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-3">
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                  <p className="text-xs text-[#8b949e]">Recent run-rate</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#e6edf3]">
                    {formatCurrency(expenseProjection?.currentRunRate ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8b949e]">
                    Avg monthly spend from recent complete months.
                  </p>
                </div>
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                  <p className="text-xs text-[#8b949e]">Last-year seasonal avg</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#e6edf3]">
                    {formatCurrency(expenseProjection?.lastYearSeasonalMonthlyAvg ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8b949e]">
                    From {expenseProjection?.sourceMonths?.join(", ") || "prior-year months"}.
                  </p>
                </div>
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                  <p className="text-xs text-[#8b949e]">Blended monthly estimate</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#f85149]">
                    {formatCurrency(expenseProjection?.blendedMonthlyEstimate ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8b949e]">
                    50/50 recent actuals and last-year seasonality.
                  </p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={spendChartData}>
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#8b949e", fontSize: 10 }}
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
                    height={28}
                    formatter={(value: string) => (
                      <span className="text-xs text-[#8b949e]">{value}</span>
                    )}
                  />
                  {expenseProjection?.blendedMonthlyEstimate ? (
                    <ReferenceLine
                      y={expenseProjection.blendedMonthlyEstimate}
                      stroke="#8b949e"
                      strokeDasharray="4 4"
                      label={{
                        value: "projection avg",
                        fill: "#8b949e",
                        fontSize: 10,
                        position: "right",
                      }}
                    />
                  ) : null}
                  <Bar
                    dataKey="currentYearTotal"
                    name="This Year"
                    fill="#f85149"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Line
                    type="monotone"
                    dataKey="priorYearTotal"
                    name="Last Year"
                    stroke="#d29922"
                    strokeWidth={2}
                    dot={{ fill: "#d29922", r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>

              {topCategoriesThisMonth.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-medium text-[#8b949e] mb-2">
                    Top Categories — {spendData?.months?.[0]?.month}
                  </p>
                  <div className="space-y-2">
                    {topCategoriesThisMonth.slice(0, 8).map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-[#e6edf3]">{c.name}</span>
                        <span className="font-mono tabular-nums text-[#8b949e]">
                          {formatCurrency(c.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Expected Collections Table */}
      <Card className="bg-[#161b22] border-[#30363d]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Top Cash Collections (Open Invoices)
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
