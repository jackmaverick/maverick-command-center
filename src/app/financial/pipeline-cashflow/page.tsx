"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, DollarSign, FileText, GitBranch, Percent, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/dates";

type CashBucketKey = "next30" | "next60" | "next90" | "later";

interface PipelineCashflowResponse {
  generatedAt: string;
  sourceWindow: {
    jobStageHistoryStarts: string;
    cohortStarts: string;
    caveat: string;
  };
  summary: {
    totalActivePipeline: number;
    expectedWeightedCash90: number;
    activeJobCount: number;
  };
  cashBuckets: Array<{
    bucket: CashBucketKey;
    ar: number;
    soldPipeline: number;
    estimatePipeline: number;
    totalWeighted: number;
  }>;
  timingByRecordType: Array<{
    recordType: string;
    jobs: number;
    withEstimate: number;
    leadToEstimateDays: number | null;
    appointmentToRanDays: number | null;
    estimatingToSentDays: number | null;
    soldJobs: number;
    soldOverLeadsPct: number | null;
    soldOverEstimatesPct: number | null;
    soldToInstallDays: number | null;
    soldToInvoiceDays: number | null;
    invoiceToPaidDays: number | null;
    soldToPaidDays: number | null;
    pipelineValue: number;
  }>;
  statusValue: Array<{
    recordType: string;
    status: string;
    jobs: number;
    value: number;
  }>;
  transitions: Array<{
    recordType: string;
    from: string;
    to: string;
    jobs: number;
    avgDays: number;
    medianDays: number;
    p75Days: number;
    p90Days: number;
  }>;
  conversions: Array<{
    recordType: string;
    from: string;
    to: string;
    fromJobs: number;
    convertedJobs: number;
    conversionRate: number;
  }>;
  notes: string[];
}

const bucketLabels: Record<CashBucketKey, string> = {
  next30: "Next 30",
  next60: "31-60",
  next90: "61-90",
  later: "Later",
};

const recordTypeColors: Record<string, string> = {
  Retail: "#58a6ff",
  Insurance: "#d29922",
  Repairs: "#3fb950",
};

function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}d`;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function topStatuses(data: PipelineCashflowResponse | undefined, recordType: string) {
  return (data?.statusValue ?? [])
    .filter((row) => row.recordType === recordType && row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

export default function PipelineCashflowPage() {
  const { data, isLoading, isError, error } = useQuery<PipelineCashflowResponse>({
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

  const maxBucket = useMemo(
    () => Math.max(1, ...(data?.cashBuckets.map((b) => b.totalWeighted) ?? [1])),
    [data]
  );

  const recordTypes = useMemo(
    () => data?.timingByRecordType.map((row) => row.recordType) ?? ["Retail", "Insurance", "Repairs"],
    [data]
  );

  const transitionRows = useMemo(
    () => (data?.transitions ?? []).filter((row) => row.jobs > 0).slice(0, 18),
    [data]
  );

  const conversionRows = useMemo(
    () => (data?.conversions ?? []).filter((row) => row.fromJobs > 0).slice(0, 18),
    [data]
  );

  const totalEstimatesFound = useMemo(
    () => data?.timingByRecordType.reduce((sum, row) => sum + row.withEstimate, 0) ?? 0,
    [data]
  );

  const totalSoldJobs = useMemo(
    () => data?.timingByRecordType.reduce((sum, row) => sum + row.soldJobs, 0) ?? 0,
    [data]
  );

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-[#8b949e]">
            <Link href="/financial/cashflow" className="hover:text-[#58a6ff]">
              Cash Flow
            </Link>
            <span>/</span>
            <span>Pipeline Timing Model</span>
          </div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Pipeline Cash Forecast
          </h1>
          <p className="text-sm text-[#8b949e] max-w-3xl">
            JobNimbus pipeline timing by record type: what money exists, what the values are based on,
            and when it usually turns into cash.
          </p>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-4 py-3 text-xs text-[#8b949e]">
          <p className="font-medium text-[#e6edf3]">Read-only V1</p>
          <p>No JobNimbus writes. No CRM mutations. Just the numbers behaving themselves.</p>
        </div>
      </div>

      {isError && (
        <Card className="mb-6 border-[#f85149]/40 bg-[#f85149]/10">
          <CardContent className="p-4 text-sm text-[#ffb4ae]">
            Pipeline cashflow API failed: {error instanceof Error ? error.message : "Unknown error"}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <DollarSign className="h-4 w-4" />
              <InfoTooltip
                label="Weighted 90d Cash"
                explanation="Expected cash over the next 90 days. Open invoice balances count at full value. Sold/post-sold pipeline is weighted at 90%. Estimate-stage pipeline is weighted by historical Estimate Sent → Sold Job conversion for that record type."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-28 bg-[#21262d]" /> : (
              <p className="text-2xl font-bold text-[#3fb950]">
                {formatCurrency(data?.summary.expectedWeightedCash90 ?? 0)}
              </p>
            )}
            <p className="mt-1 text-xs text-[#8b949e]">AR + probability-weighted pipeline</p>
          </CardContent>
        </Card>
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <GitBranch className="h-4 w-4" />
              <InfoTooltip
                label="Active Pipeline"
                explanation="Sum of active, non-archived JobNimbus jobs in Retail, Insurance, and Repairs, excluding Lost/Dead/Cold/test jobs. Current V1 value uses the highest job-level rollup among approved estimate, approved invoice, latest estimate, and latest invoice."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-28 bg-[#21262d]" /> : (
              <p className="text-2xl font-bold text-[#58a6ff]">
                {formatCurrency(data?.summary.totalActivePipeline ?? 0)}
              </p>
            )}
            <p className="mt-1 text-xs text-[#8b949e]">{data?.summary.activeJobCount ?? "—"} active jobs counted</p>
          </CardContent>
        </Card>
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <FileText className="h-4 w-4" />
              <InfoTooltip
                label="Estimates Found"
                explanation="Count of active jobs in the current cohort that have at least one active estimate record. This is a count, not dollars. It helps show how much of the pipeline has actual estimate evidence behind it."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-28 bg-[#21262d]" /> : (
              <p className="text-2xl font-bold text-[#d29922]">
                {totalEstimatesFound.toLocaleString()}
              </p>
            )}
            <p className="mt-1 text-xs text-[#8b949e]">{totalSoldJobs.toLocaleString()} sold/post-sold jobs in cohort</p>
          </CardContent>
        </Card>
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-[#8b949e]">
              <ShieldCheck className="h-4 w-4" /> Data Window
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-28 bg-[#21262d]" /> : (
              <p className="text-2xl font-bold text-[#e6edf3]">
                {data?.sourceWindow.jobStageHistoryStarts ?? "—"}
              </p>
            )}
            <p className="mt-1 text-xs text-[#8b949e]">Status history starts here</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 mb-8">
        <Card className="xl:col-span-2 bg-[#0d1117] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-base text-[#e6edf3]">
              <InfoTooltip
                label="Expected Cash Buckets"
                explanation="Buckets estimate when cash may arrive. AR uses open invoice balances. Sold/post-sold pipeline uses the current pipeline value weighted at 90%. Estimate pipeline is shown separately and weighted by historical conversion, because estimates are not cash."
              />
            </CardTitle>
            <p className="text-xs text-[#8b949e]">
              Estimate pipeline is separate on purpose. Hope is not a cash-management strategy, unfortunately.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(data?.cashBuckets ?? ["next30", "next60", "next90", "later"].map((bucket) => ({ bucket: bucket as CashBucketKey, ar: 0, soldPipeline: 0, estimatePipeline: 0, totalWeighted: 0 }))).map((bucket) => {
                const width = Math.max(2, (bucket.totalWeighted / maxBucket) * 100);
                return (
                  <div key={bucket.bucket}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#e6edf3]">{bucketLabels[bucket.bucket]}</p>
                        <p className="text-xs text-[#8b949e]">
                          AR {formatCurrency(bucket.ar)} · Sold {formatCurrency(bucket.soldPipeline)} · Estimate {formatCurrency(bucket.estimatePipeline)}
                        </p>
                      </div>
                      <p className="font-mono text-sm font-semibold text-[#3fb950]">
                        {formatCurrency(bucket.totalWeighted)}
                      </p>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-[#21262d]">
                      <div className="h-full rounded-full bg-[#3fb950]" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0d1117] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-base text-[#e6edf3]">
              <InfoTooltip
                label="Record Type Timing"
                explanation="Timing stats by Retail, Insurance, and Repairs. Lead → estimate comes from job creation to first active estimate. Sold → paid uses JobNimbus stage history plus invoice paid-in-full dates where available."
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(data?.timingByRecordType ?? []).map((row) => (
                <div key={row.recordType} className="rounded-lg border border-[#30363d] bg-[#161b22] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: recordTypeColors[row.recordType] ?? "#8b949e" }}
                      />
                      <p className="font-semibold text-[#e6edf3]">{row.recordType}</p>
                    </div>
                    <p className="text-xs text-[#8b949e]">{row.jobs} jobs</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[#8b949e]">Lead → estimate</p>
                      <p className="font-mono text-[#e6edf3]">{formatDays(row.leadToEstimateDays)}</p>
                    </div>
                    <div>
                      <p className="text-[#8b949e]">Sold → paid</p>
                      <p className="font-mono text-[#e6edf3]">{formatDays(row.soldToPaidDays)}</p>
                    </div>
                    <div>
                      <p className="text-[#8b949e]">Invoice → paid</p>
                      <p className="font-mono text-[#e6edf3]">{formatDays(row.invoiceToPaidDays)}</p>
                    </div>
                    <div>
                      <p className="text-[#8b949e]">Sold / estimates</p>
                      <p className="font-mono text-[#e6edf3]">{formatPct(row.soldOverEstimatesPct)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 bg-[#21262d]" />)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 mb-8">
        {recordTypes.map((recordType) => {
          const statuses = topStatuses(data, recordType);
          const total = statuses.reduce((sum, row) => sum + row.value, 0) || 1;
          return (
            <Card key={recordType} className="bg-[#0d1117] border-[#30363d]">
              <CardHeader>
                <CardTitle className="text-base text-[#e6edf3]">
                  <InfoTooltip
                    label={`${recordType} Pipeline Dollars by Status`}
                    explanation="Each status bucket sums the active jobs currently in that JobNimbus status. Dollar value currently uses the highest job-level rollup available: approved estimate, approved invoice, latest estimate, or latest invoice. It does not yet drill into every estimate row, so voided/replaced estimates depend on the JobNimbus/Supabase rollup being current."
                  />
                </CardTitle>
                <p className="text-xs text-[#8b949e]">Top active status buckets by value</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {isLoading && [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 bg-[#21262d]" />)}
                  {statuses.map((row) => (
                    <div key={`${row.recordType}-${row.status}`}>
                      <div className="mb-1 flex justify-between gap-3 text-xs">
                        <span className="truncate text-[#e6edf3]">{row.status}</span>
                        <span className="font-mono text-[#8b949e]">{formatCurrency(row.value)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#21262d]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(3, (row.value / total) * 100)}%`,
                            backgroundColor: recordTypeColors[row.recordType] ?? "#8b949e",
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-[#8b949e]">{row.jobs} jobs</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2 mb-8">
        <Card className="bg-[#0d1117] border-[#30363d]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#e6edf3]">
              <Clock className="h-4 w-4" />
              <InfoTooltip
                label="Transition Timing Stats"
                explanation="How long jobs historically took to move from one JobNimbus status to the next. n = sample count. Avg is the mean. Med is the middle job. P75/P90 show the slower edge of normal, which is usually better for operations than average alone."
              />
            </CardTitle>
            <p className="text-xs text-[#8b949e]">Average, median, p75, p90, with sample size.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#8b949e]">
                  <tr className="border-b border-[#30363d]">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Transition</th>
                    <th className="py-2 pr-3 text-right">n</th>
                    <th className="py-2 pr-3 text-right">Avg</th>
                    <th className="py-2 pr-3 text-right">Med</th>
                    <th className="py-2 pr-3 text-right">P75</th>
                    <th className="py-2 text-right">P90</th>
                  </tr>
                </thead>
                <tbody>
                  {transitionRows.map((row) => (
                    <tr key={`${row.recordType}-${row.from}-${row.to}`} className="border-b border-[#21262d] text-[#e6edf3]">
                      <td className="py-2 pr-3 text-[#8b949e]">{row.recordType}</td>
                      <td className="py-2 pr-3">{row.from} → {row.to}</td>
                      <td className="py-2 pr-3 text-right font-mono">{row.jobs}</td>
                      <td className="py-2 pr-3 text-right font-mono">{formatDays(row.avgDays)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{formatDays(row.medianDays)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{formatDays(row.p75Days)}</td>
                      <td className="py-2 text-right font-mono">{formatDays(row.p90Days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0d1117] border-[#30363d]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#e6edf3]">
              <Percent className="h-4 w-4" />
              <InfoTooltip
                label="Conversion Stats"
                explanation="For each historical status gate, From means jobs that reached the first status. Converted means those same jobs later reached the next status. Rate = Converted ÷ From. This is not a current-job count; it comes from JobNimbus status history."
              />
            </CardTitle>
            <p className="text-xs text-[#8b949e]">Historical status-gate conversion by record type. Less Matrix, more actual English.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#8b949e]">
                  <tr className="border-b border-[#30363d]">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Conversion</th>
                    <th className="py-2 pr-3 text-right">Reached</th>
                    <th className="py-2 pr-3 text-right">Made next step</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {conversionRows.map((row) => (
                    <tr key={`${row.recordType}-${row.from}-${row.to}`} className="border-b border-[#21262d] text-[#e6edf3]">
                      <td className="py-2 pr-3 text-[#8b949e]">{row.recordType}</td>
                      <td className="py-2 pr-3">{row.from} → {row.to}</td>
                      <td className="py-2 pr-3 text-right font-mono">{row.fromJobs}</td>
                      <td className="py-2 pr-3 text-right font-mono">{row.convertedJobs}</td>
                      <td className="py-2 text-right font-mono text-[#3fb950]">{formatPct(row.conversionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#0d1117] border-[#30363d]">
        <CardContent className="p-4 text-xs text-[#8b949e]">
          <p className="mb-2 font-medium text-[#e6edf3]">Data notes</p>
          <ul className="list-disc space-y-1 pl-5">
            {(data?.notes ?? []).map((note) => <li key={note}>{note}</li>)}
            <li>{data?.sourceWindow.caveat ?? "Status history window loads from the API."}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
