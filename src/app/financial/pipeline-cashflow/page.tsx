"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/dates";

type Horizon = "next30" | "next60" | "next90";

type HealthStatus = "green" | "yellow" | "red";

type PipelineHealthData = {
  generatedAt: string;
  status: HealthStatus;
  apiShape: {
    status: HealthStatus;
    generatedAt: string | null;
    checks: { key: string; present: boolean; count: number }[];
  };
  freshness: {
    status: HealthStatus;
    maxAgeHours: number;
    sources: {
      source: string;
      rowCount: number;
      latestSourceAt: string | null;
      latestSyncedAt: string | null;
      sourceAgeHours: number | null;
      syncedAgeHours: number | null;
      ageHours: number | null;
      redAfterHours: number;
      status: HealthStatus;
    }[];
    syncMode: {
      current: string;
      nearInstantRequirement: string;
    };
  };
  reconciliation: {
    status: HealthStatus;
    maxVarianceDollars: number;
    maxVariancePercent: number;
    comparisons: {
      label: string;
      sourceValue: number;
      apiValue: number | null;
      varianceDollars: number;
      variancePercent: number;
      status: HealthStatus;
    }[];
  };
  classification: {
    status: HealthStatus;
    materialUnmapped: { statusName: string; jobCount: number; rawValue: number; material: boolean }[];
    statusBucketCount: number;
  };
  instantAccuracy: {
    status: HealthStatus;
    summary: string;
    nextBestBuild: string;
  };
};

type PipelineCashflowData = {
  generatedAt: string;
  cohortStart: string;
  sourceNotes: string[];
  summary: {
    activePipelineValue: number;
    activeJobCount: number;
    arTotal: number;
    arWeighted: number;
    estimatePipelineValue: number;
    soldPipelineValue: number;
    expectedCash: Record<Horizon, number>;
  };
  stageCounts: {
    stage: string;
    jobCount: number;
    rawValue: number;
  }[];
  arBySegment: {
    segment: string;
    invoiceCount: number;
    totalDue: number;
    weightedDue: number;
    over30Due: number;
  }[];
  pipelineByStage: {
    segment: string;
    statusName: string;
    jobCount: number;
    rawValue: number;
    weighted30: number;
    weighted60: number;
    weighted90: number;
    confidence: string;
  }[];
  timing: {
    segment: string;
    transitionKey: string;
    sampleCount: number;
    avgDays: number | null;
    medianDays: number | null;
    p75Days: number | null;
    p90Days: number | null;
  }[];
  conversionMatrix: {
    segment: string;
    gate: string;
    reachedCount: number;
    cohortCount: number;
    rate: number;
  }[];
  stuckMoney: {
    jobJnid: string;
    jobNumber: string | null;
    jobName: string;
    segment: string;
    statusName: string;
    value: number;
    daysInStatus: number;
    p75Days: number | null;
    jobUrl: string;
  }[];
};

type OperatingExpensesData = {
  generatedAt: string;
  source: {
    sheetId: string;
    tab: string;
    range: string;
    url: string;
  };
  summary: {
    totalMonthly: number;
    totalAnnualized: number;
    expenseCount: number;
    highConfidenceCount: number;
  };
  byCategory: {
    category: string;
    monthlyAmount: number;
    percentOfTotal: number;
    rows: number;
  }[];
  topExpenses: {
    name: string;
    category: string;
    amount: number;
    monthlyAmount: number;
    percentOfTotal: number | null;
    frequency: string;
    confidence: string;
    notes: string;
  }[];
  notes: string[];
};

const horizonLabels: Record<Horizon, string> = {
  next30: "30 days",
  next60: "60 days",
  next90: "90 days",
};

function pctLabel(value: number) {
  return `${Math.round(value)}%`;
}

function displaySegment(segment: string) {
  return segment.replace("_", " ");
}

function displayStage(stage: string) {
  const labels: Record<string, string> = {
    sold: "Sold / approved",
    approval: "Blocked approvals",
    production_ready: "Production ready",
    scheduled: "Scheduled",
    production: "In production",
  };
  return labels[stage] ?? stage.replaceAll("_", " ");
}

function displayTransition(key: string) {
  return key.replace("_to_", " → ").replaceAll("_", " ");
}

function statusClasses(status: HealthStatus) {
  if (status === "green") return "text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20";
  if (status === "yellow") return "text-[#d29922] bg-[#d29922]/10 border-[#d29922]/20";
  return "text-[#f85149] bg-[#f85149]/10 border-[#f85149]/20";
}

function statusLabel(status: HealthStatus) {
  if (status === "green") return "green";
  if (status === "yellow") return "watch";
  return "broken";
}

function formatAge(hours: number | null) {
  if (hours === null) return "unknown";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${Math.round(hours * 10) / 10}h`;
}

function stageWeightedValue(row: PipelineCashflowData["pipelineByStage"][number], horizon: Horizon) {
  if (horizon === "next30") return row.weighted30;
  if (horizon === "next60") return row.weighted60;
  return row.weighted90;
}

export default function PipelineCashflowPage() {
  const [horizon, setHorizon] = useState<Horizon>("next90");

  const { data, isLoading, isError, error } = useQuery<PipelineCashflowData>({
    queryKey: ["pipeline-cashflow"],
    queryFn: async () => {
      const res = await fetch("/api/financial/pipeline-cashflow");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to fetch pipeline cashflow");
      }
      return res.json();
    },
  });

  const { data: health, isLoading: healthLoading } = useQuery<PipelineHealthData>({
    queryKey: ["pipeline-cashflow-health"],
    queryFn: async () => {
      const res = await fetch("/api/financial/pipeline-cashflow/health");
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.status) {
        throw new Error(body.error ?? "Failed to fetch pipeline cashflow health");
      }
      return body;
    },
    refetchInterval: 60_000,
  });

  const { data: operatingExpenses, isLoading: opexLoading, isError: opexError } = useQuery<OperatingExpensesData>({
    queryKey: ["pipeline-cashflow-operating-expenses"],
    queryFn: async () => {
      const res = await fetch("/api/financial/pipeline-cashflow/operating-expenses");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to fetch operating expenses");
      }
      return body;
    },
    refetchInterval: 5 * 60_000,
  });

  const segmentChart = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, { segment: string; ar: number; pipeline: number }>();
    for (const row of data.arBySegment) {
      totals.set(row.segment, {
        segment: displaySegment(row.segment),
        ar: row.weightedDue,
        pipeline: totals.get(row.segment)?.pipeline ?? 0,
      });
    }
    for (const row of data.pipelineByStage) {
      const existing = totals.get(row.segment) ?? {
        segment: displaySegment(row.segment),
        ar: 0,
        pipeline: 0,
      };
      existing.pipeline += stageWeightedValue(row, horizon);
      totals.set(row.segment, existing);
    }
    return Array.from(totals.values()).sort((a, b) => b.ar + b.pipeline - (a.ar + a.pipeline));
  }, [data, horizon]);

  const topPipelineRows = useMemo(() => {
    if (!data) return [];
    return [...data.pipelineByStage]
      .sort((a, b) => stageWeightedValue(b, horizon) - stageWeightedValue(a, horizon))
      .slice(0, 12);
  }, [data, horizon]);

  if (isError) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">Pipeline Cashflow</h1>
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardContent className="pt-6">
            <p className="text-sm text-[#f85149]">{error instanceof Error ? error.message : "Pipeline cashflow is unavailable."}</p>
            <p className="text-xs text-[#8b949e] mt-2">No fake zeroes. If the data source is down, this page says so.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-[#e6edf3]">Pipeline Cashflow</h1>
            <span className="text-[10px] uppercase tracking-wide text-[#d29922] bg-[#d29922]/10 border border-[#d29922]/20 rounded-full px-2 py-0.5">
              read-only v1
            </span>
            {health && (
              <span className={`text-[10px] uppercase tracking-wide border rounded-full px-2 py-0.5 ${statusClasses(health.status)}`}>
                monitor {statusLabel(health.status)}
              </span>
            )}
          </div>
          <p className="text-sm text-[#8b949e] max-w-3xl">
            Post-sold JobNimbus cash model: Sold/Fully Approved/Future Work, deductible/supplement/approval blockers, Production Ready, Scheduled, In Production, and AR.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(horizonLabels) as Horizon[]).map((key) => (
            <button
              key={key}
              onClick={() => setHorizon(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                horizon === key
                  ? "bg-[#58a6ff]/10 text-[#58a6ff] border-[#58a6ff]/30"
                  : "text-[#8b949e] border-[#30363d] hover:text-[#e6edf3] hover:bg-[#21262d]"
              }`}
            >
              {horizonLabels[key]}
            </button>
          ))}
          <Link href="/financial/cashflow" className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]">
            Cash balance page
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-[#161b22] border-[#30363d] md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              <InfoTooltip
                label={`Post-sold Expected Cash, ${horizonLabels[horizon]}`}
                explanation="Weighted AR plus signed/post-sold open work for the selected horizon. Invoiced jobs are counted through AR so the same money is not counted twice."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-9 w-40 bg-[#21262d]" /> : (
              <>
                <p className="text-3xl font-bold text-[#3fb950]">{formatCurrency(data?.summary.expectedCash[horizon] ?? 0)}</p>
                <p className="text-xs text-[#8b949e] mt-2">Weighted AR plus signed/post-sold open work. Invoiced work is handled through AR so it is not double-counted.</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              <InfoTooltip
                label="Weighted AR"
                explanation="Open invoice balances, weighted by invoice age. Newer invoices get higher collection weight; older AR is discounted because it is less reliable cash."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24 bg-[#21262d]" /> : <p className="text-2xl font-bold text-[#58a6ff]">{formatCurrency(data?.summary.arWeighted ?? 0)}</p>}
            {!isLoading && <p className="text-xs text-[#8b949e] mt-1">Total AR: {formatCurrency(data?.summary.arTotal ?? 0)}</p>}
          </CardContent>
        </Card>
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-[#8b949e]">
              <InfoTooltip
                label="Excluded Pre-sold Pipeline"
                explanation="Estimate Sent and Estimating dollars shown as context only. They are deliberately excluded from expected cash until the job is signed/post-sold, because estimates are not payroll money."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24 bg-[#21262d]" /> : <p className="text-2xl font-bold text-[#d29922]">{formatCurrency(data?.summary.estimatePipelineValue ?? 0)}</p>}
            {!isLoading && <p className="text-xs text-[#8b949e] mt-1">Estimate Sent / estimating context only.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-[#e6edf3]">
                <InfoTooltip
                  label="Monthly Operating Expenses"
                  explanation="Pulled read-only from the Recurring Expenses tab in the cash-flow Google Sheet. Amounts are normalized to monthly run-rate using the Frequency column. This is forecast input, not QBO/bank actuals yet."
                />
              </CardTitle>
              <p className="mt-1 text-xs text-[#8b949e]">
                Source: Recurring Expenses tab. Edit that sheet tab when Brent/Jack correct the numbers.
              </p>
            </div>
            {operatingExpenses?.source.url && (
              <a href={operatingExpenses.source.url} target="_blank" rel="noreferrer" className="text-xs text-[#58a6ff] hover:underline">
                Open sheet tab
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {opexLoading ? (
            <Skeleton className="h-72 w-full bg-[#21262d]" />
          ) : opexError || !operatingExpenses ? (
            <div className="rounded-lg border border-[#d29922]/30 bg-[#d29922]/10 p-4 text-sm text-[#d29922]">
              Operating-expense sheet read is not configured in this environment yet. The page is ready for it, but Vercel needs the Google service-account JSON env var.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
              <div className="xl:col-span-2 space-y-3">
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[#8b949e]">Monthly run-rate</p>
                  <p className="mt-1 text-3xl font-bold text-[#e6edf3]">{formatCurrency(operatingExpenses.summary.totalMonthly)}</p>
                  <p className="mt-1 text-xs text-[#8b949e]">
                    {formatCurrency(operatingExpenses.summary.totalAnnualized)} annualized • {operatingExpenses.summary.expenseCount} rows • {operatingExpenses.summary.highConfidenceCount} high-confidence
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {operatingExpenses.byCategory.slice(0, 6).map((category) => (
                    <div key={category.category} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-medium text-[#e6edf3]">{category.category}</p>
                        <p className="font-mono text-xs text-[#8b949e]">{category.percentOfTotal}%</p>
                      </div>
                      <p className="mt-1 font-mono text-sm text-[#3fb950]">{formatCurrency(category.monthlyAmount)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="xl:col-span-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#30363d] text-[#8b949e]">
                      <th className="text-left py-2 pr-2 font-medium">Expense</th>
                      <th className="text-left py-2 px-2 font-medium">Category</th>
                      <th className="text-right py-2 px-2 font-medium">Monthly</th>
                      <th className="text-left py-2 pl-2 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operatingExpenses.topExpenses.map((row) => (
                      <tr key={`${row.category}-${row.name}`} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                        <td className="py-2 pr-2 text-[#e6edf3]">
                          <div>{row.name}</div>
                          {row.notes && <div className="mt-0.5 text-[11px] text-[#8b949e]">{row.notes}</div>}
                        </td>
                        <td className="py-2 px-2 text-[#8b949e]">{row.category}</td>
                        <td className="py-2 px-2 text-right font-mono text-[#e6edf3]">{formatCurrency(row.monthlyAmount)}</td>
                        <td className="py-2 pl-2 text-[#8b949e] capitalize">{row.confidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-[#8b949e]">
                  Accuracy note: these are planned recurring expenses from the sheet, not bank/QBO actuals. Good enough for planning once Brent validates the tab, not gospel carved into a spreadsheet-shaped tablet.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">Reliability Monitor</CardTitle>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <Skeleton className="h-28 w-full bg-[#21262d]" />
          ) : !health || !health.freshness || !health.reconciliation || !health.classification || !health.instantAccuracy ? (
            <p className="text-sm text-[#f85149]">Monitor unavailable. The cash number may still load, but trust drops until health checks return.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#8b949e]">Overall</p>
                <p className={`text-lg font-bold mt-1 ${health.status === "green" ? "text-[#3fb950]" : health.status === "yellow" ? "text-[#d29922]" : "text-[#f85149]"}`}>{statusLabel(health.status)}</p>
                <p className="text-xs text-[#8b949e] mt-1">API shape, freshness, reconciliation, and classification.</p>
              </div>
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#8b949e]">Freshness</p>
                <p className={`text-lg font-bold mt-1 ${health.freshness.status === "green" ? "text-[#3fb950]" : health.freshness.status === "yellow" ? "text-[#d29922]" : "text-[#f85149]"}`}>{formatAge(health.freshness.maxAgeHours)} worst source</p>
                <p className="text-xs text-[#8b949e] mt-1">Near-instant accuracy depends on the JN → Supabase mirror staying fresh.</p>
              </div>
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#8b949e]">Reconciliation</p>
                <p className={`text-lg font-bold mt-1 ${health.reconciliation.status === "green" ? "text-[#3fb950]" : health.reconciliation.status === "yellow" ? "text-[#d29922]" : "text-[#f85149]"}`}>{formatCurrency(health.reconciliation.maxVarianceDollars)}</p>
                <p className="text-xs text-[#8b949e] mt-1">Max variance between API cards and raw Supabase recalculation.</p>
              </div>
              <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#8b949e]">Classification</p>
                <p className={`text-lg font-bold mt-1 ${health.classification.status === "green" ? "text-[#3fb950]" : "text-[#d29922]"}`}>{health.classification.materialUnmapped.length} material unmapped</p>
                <p className="text-xs text-[#8b949e] mt-1">High-dollar statuses not mapped into a cash stage.</p>
              </div>
              <div className="md:col-span-4 rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs text-[#8b949e]">
                {health.instantAccuracy.summary} Next: {health.instantAccuracy.nextBestBuild}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-8">
        {isLoading ? Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 bg-[#21262d]" />
        )) : data?.stageCounts.map((stage) => (
          <Card key={stage.stage} className="bg-[#161b22] border-[#30363d]">
            <CardContent className="pt-4">
              <p className="text-[11px] uppercase tracking-wide text-[#8b949e]">{displayStage(stage.stage)}</p>
              <div className="flex items-baseline justify-between gap-2 mt-2">
                <p className="text-2xl font-bold text-[#e6edf3]">{stage.jobCount}</p>
                <p className="text-xs font-mono text-[#3fb950]">{formatCurrency(stage.rawValue)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-8">
        <Card className="bg-[#161b22] border-[#30363d] xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">Post-sold Cash by Segment</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full bg-[#21262d]" /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={segmentChart}>
                  <CartesianGrid stroke="#30363d" vertical={false} />
                  <XAxis dataKey="segment" tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(Number(v))} />
                  <Tooltip contentStyle={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="ar" name="Weighted AR" stackId="cash" fill="#58a6ff" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pipeline" name="Weighted Pipeline" stackId="cash" fill="#3fb950" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d] xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">Data Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[300px] w-full bg-[#21262d]" /> : (
              <div className="space-y-3">
                {data?.sourceNotes.map((note) => (
                  <div key={note} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs text-[#8b949e]">
                    {note}
                  </div>
                ))}
                <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs text-[#8b949e]">
                  Generated: {data ? new Date(data.generatedAt).toLocaleString() : "—"}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              <InfoTooltip
                label="Pipeline Dollars by Status"
                explanation="Dollar value by current JobNimbus status. Raw value uses the highest job-level rollup available: approved invoice due, approved invoice total, approved estimate total, parent approved invoice/estimate, latest invoice, or latest estimate. The weighted column applies the selected 30/60/90-day cash probability. Multiple or voided estimates depend on the JobNimbus/Supabase job rollup being current, so row-level estimate selection is the next accuracy upgrade."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-72 w-full bg-[#21262d]" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#30363d] text-[#8b949e]">
                      <th className="text-left py-2 pr-2 font-medium">Status</th>
                      <th className="text-left py-2 px-2 font-medium">Segment</th>
                      <th className="text-right py-2 px-2 font-medium">Jobs</th>
                      <th className="text-right py-2 px-2 font-medium">Raw</th>
                      <th className="text-right py-2 pl-2 font-medium">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPipelineRows.map((row) => (
                      <tr key={`${row.segment}-${row.statusName}`} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                        <td className="py-2 pr-2 text-[#e6edf3]">{row.statusName}</td>
                        <td className="py-2 px-2 text-[#8b949e] capitalize">{displaySegment(row.segment)}</td>
                        <td className="py-2 px-2 text-right text-[#8b949e] font-mono">{row.jobCount}</td>
                        <td className="py-2 px-2 text-right text-[#e6edf3] font-mono">{formatCurrency(row.rawValue)}</td>
                        <td className="py-2 pl-2 text-right text-[#3fb950] font-mono">{formatCurrency(stageWeightedValue(row, horizon))}</td>
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
                label="Timing Stats"
                explanation="Historical timing between JobNimbus status gates. N is sample size, Median is the middle job, and P75 means 75% of jobs moved by that many days. P75 is the better operations threshold because averages get weird fast."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-72 w-full bg-[#21262d]" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#30363d] text-[#8b949e]">
                      <th className="text-left py-2 pr-2 font-medium">Segment</th>
                      <th className="text-left py-2 px-2 font-medium">Transition</th>
                      <th className="text-right py-2 px-2 font-medium">N</th>
                      <th className="text-right py-2 px-2 font-medium">Median</th>
                      <th className="text-right py-2 pl-2 font-medium">P75</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.timing.slice(0, 18).map((row) => (
                      <tr key={`${row.segment}-${row.transitionKey}`} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                        <td className="py-2 pr-2 text-[#8b949e] capitalize">{displaySegment(row.segment)}</td>
                        <td className="py-2 px-2 text-[#e6edf3]">{displayTransition(row.transitionKey)}</td>
                        <td className="py-2 px-2 text-right text-[#8b949e] font-mono">{row.sampleCount}</td>
                        <td className="py-2 px-2 text-right text-[#e6edf3] font-mono">{row.medianDays ?? "—"}d</td>
                        <td className="py-2 pl-2 text-right text-[#d29922] font-mono">{row.p75Days ?? "—"}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              <InfoTooltip
                label="Conversion Stats"
                explanation="For each status gate, Reached is jobs that hit that gate out of the cohort. Rate = reached ÷ cohort. This is historical JobNimbus movement, not a current pipeline dollar number."
              />
            </CardTitle>
            <p className="mt-1 text-xs text-[#8b949e]">Formerly labeled Conversion Gate Matrix. That name was doing nobody any favors.</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-72 w-full bg-[#21262d]" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#30363d] text-[#8b949e]">
                      <th className="text-left py-2 pr-2 font-medium">Segment</th>
                      <th className="text-left py-2 px-2 font-medium">Gate</th>
                      <th className="text-right py-2 px-2 font-medium">Reached</th>
                      <th className="text-right py-2 pl-2 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.conversionMatrix.map((row) => (
                      <tr key={`${row.segment}-${row.gate}`} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                        <td className="py-2 pr-2 text-[#8b949e] capitalize">{displaySegment(row.segment)}</td>
                        <td className="py-2 px-2 text-[#e6edf3] capitalize">{row.gate}</td>
                        <td className="py-2 px-2 text-right text-[#8b949e] font-mono">{row.reachedCount}/{row.cohortCount}</td>
                        <td className="py-2 pl-2 text-right text-[#58a6ff] font-mono">{pctLabel(row.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
