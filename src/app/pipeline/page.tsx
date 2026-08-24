"use client";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTooltip } from "@/components/InfoTooltip";
import { formatCurrency, formatPercent } from "@/lib/dates";
import { TRADE_FILTERS, type TradeFilter } from "@/lib/constants";

interface CurrentStage {
  stage: string;
  jobCount: number;
  pipelineValue: number;
  arDue: number;
  avgDaysInStatus: number | null;
}

interface CurrentStatus {
  recordType: string;
  recordTypeLabel: string;
  stage: string;
  statusName: string;
  jobCount: number;
  pipelineValue: number;
  arDue: number;
  avgDaysInStatus: number | null;
}

interface RecordTypeSummary {
  recordType: string;
  label: string;
  activeJobs: number;
  pipelineValue: number;
  arDue: number;
  stageCounts: {
    leads: number;
    appointmentsScheduled: number;
    appointmentsRan: number;
    estimating: number;
    production: number;
    accountsReceivable: number;
  };
}

interface TimingRow {
  recordType: string;
  recordTypeLabel: string;
  fromStatus?: string;
  toStatus?: string;
  fromStage?: string;
  toStage?: string;
  sampleCount: number;
  avgDays: number | null;
  medianDays: number | null;
  p75Days: number | null;
  p90Days: number | null;
}

interface ConversionRow {
  recordType: string;
  recordTypeLabel: string;
  fromStatus: string;
  toStatus: string;
  fromCount: number;
  convertedCount: number;
  conversionRate: number;
}

interface ForecastBucket {
  bucket: string;
  jobCount: number;
  rawValue: number;
  weightedValue: number;
}

interface TopJob {
  jobJnid: string;
  jobNumber: string | null;
  jobName: string;
  recordType: string;
  recordTypeLabel: string;
  stage: string;
  statusName: string;
  value: number;
  arDue: number;
  daysInStatus: number;
  jobUrl: string;
}

interface PipelineData {
  generatedAt: string;
  mode: string;
  cohortStart: string;
  recordTypeFilter: string | null;
  tradeFilter: TradeFilter;
  sourceNotes: string[];
  summary: {
    activeJobs: number;
    pipelineValue: number;
    arDue: number;
    leads: number;
    estimating: number;
  };
  currentStages: CurrentStage[];
  currentStatuses: CurrentStatus[];
  recordTypes: RecordTypeSummary[];
  stageTiming: TimingRow[];
  statusTiming: TimingRow[];
  statusConversions: ConversionRow[];
  forecastBuckets: ForecastBucket[];
  topJobs: TopJob[];
}

interface SalesData {
  period: {
    key: string;
    label: string;
    start: string;
    end: string;
  };
  filters: {
    segment: string | null;
    rep: string | null;
    trade: TradeFilter;
  };
  summary: {
    totalRevenue: number;
    avgCloseRate: number;
    avgCycleTimeDays: number;
    activeReps: number;
    totalJobs: number;
    totalWon: number;
  };
}

const recordTypeOptions = [
  { value: "all", label: "All Record Types" },
  { value: "retail", label: "Retail" },
  { value: "insurance", label: "Insurance" },
  { value: "repairs", label: "Repairs" },
  { value: "light_commercial", label: "Light Commercial" },
  { value: "other", label: "Other" },
];

const tradeFilterOptions: { value: TradeFilter; label: string; description?: string }[] = [
  { value: "all", label: TRADE_FILTERS.all.label, description: TRADE_FILTERS.all.description },
  { value: "none", label: TRADE_FILTERS.none.label, description: TRADE_FILTERS.none.description },
  { value: "roof", label: TRADE_FILTERS.roof.label },
  { value: "gutters", label: TRADE_FILTERS.gutters.label },
  { value: "windows", label: TRADE_FILTERS.windows.label },
];

// JobNimbus stage colors (pre-sold pipeline shows Lead + Estimating only)
const stageColors: Record<string, string> = {
  Lead: "#58a6ff",
  Estimating: "#d29922",
  Production: "#f0883e",
  "Accounts Receivable": "#3fb950",
  Completed: "#3fb950",
  Other: "#8b949e",
};

function daysLabel(days: number | null) {
  if (days === null) return "—";
  return `${days}d`;
}

function generatedLabel(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stageCount(row: RecordTypeSummary, key: keyof RecordTypeSummary["stageCounts"]) {
  return row.stageCounts[key] ?? 0;
}

function CurrencyTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#21262d] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[#8b949e]">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-[#e6edf3]">
          {entry.name}: {formatCurrency(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

function NumberTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#21262d] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[#8b949e]">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-[#e6edf3]">
          {entry.name}: {entry.value ?? 0}
        </p>
      ))}
    </div>
  );
}

const stageFormula = "status_name mapped to JobNimbus stage (Lead stage includes appointments)";
const openJobFilter = "PRE-SOLD ONLY: active + not archived + not deleted + not test/demo + not Warranty record type + status not Lost/Dead/No Damage/Internal Supplementing/Paid & Closed + JN stage in (Lead, Estimating)";

function stageValueFormula(stage: string) {
  if (stage === "Accounts Receivable") return "sum(active Sent/Open/Closed invoice balance due)";
  return "sum(max approved invoice, approved estimate, parent invoice/estimate, last invoice, last estimate)";
}

function forecastFormula(bucket: string) {
  if (bucket === "Bank cash now / collecting") return "AR due × 85%";
  if (bucket === "Production money now / soon") return "production value × 70% for retail/repairs/commercial, × 50% for insurance";
  if (bucket === "Potential production after sold") return "estimating value × 28% for retail/repairs/commercial, × 18% for insurance";
  if (bucket === "Early pipeline") return "appointment scheduled/ran value × 8%";
  if (bucket === "Raw leads") return "lead value × 3%";
  return "not weighted";
}

export default function PipelinePage() {
  const [recordType, setRecordType] = useState("all");
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("all");

  const { data, isLoading, isError, error } = useQuery<PipelineData>({
    queryKey: ["current-pipeline", recordType, tradeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (recordType !== "all") params.set("recordType", recordType);
      if (tradeFilter !== "all") params.set("trade", tradeFilter);
      const queryString = params.toString();
      const res = await fetch(`/api/pipeline${queryString ? `?${queryString}` : ""}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to fetch pipeline data");
      return body;
    },
    refetchInterval: 60_000,
  });

  const { data: salesData, isLoading: salesLoading } = useQuery<SalesData>({
    queryKey: ["sales-summary", "month", tradeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period: "month" });
      if (tradeFilter !== "all") params.set("trade", tradeFilter);
      const res = await fetch(`/api/sales?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to fetch sales data");
      return body;
    },
    refetchInterval: 60_000,
  });

  const selectedRecordType = data?.recordTypes.find((row) => row.recordType === recordType);

  const statusRows = useMemo(() => {
    if (!data) return [];
    return [...data.currentStatuses]
      .sort((a, b) => Math.max(b.pipelineValue, b.arDue) - Math.max(a.pipelineValue, a.arDue))
      .slice(0, 30);
  }, [data]);

  const stageTimingRows = useMemo(() => {
    if (!data) return [];
    return data.stageTiming
      .filter((row) => recordType === "all" || row.recordType === recordType)
      .sort((a, b) => a.recordTypeLabel.localeCompare(b.recordTypeLabel) || (a.fromStage ?? "").localeCompare(b.fromStage ?? ""));
  }, [data, recordType]);

  const statusTimingRows = useMemo(() => {
    if (!data) return [];
    return data.statusTiming
      .filter((row) => recordType === "all" || row.recordType === recordType)
      .sort((a, b) => b.sampleCount - a.sampleCount)
      .slice(0, 35);
  }, [data, recordType]);

  const conversionRows = useMemo(() => {
    if (!data) return [];
    return data.statusConversions
      .filter((row) => recordType === "all" || row.recordType === recordType)
      .filter((row) => row.fromCount >= 3)
      .sort((a, b) => a.recordTypeLabel.localeCompare(b.recordTypeLabel) || b.fromCount - a.fromCount)
      .slice(0, 40);
  }, [data, recordType]);

  const formulaStageRows = useMemo(() => {
    if (!data) return [];
    return data.currentStages.map((row) => ({
      label: row.stage,
      value: row.pipelineValue,
      jobs: row.jobCount,
      formula: stageValueFormula(row.stage),
    }));
  }, [data]);

  if (isError) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">Pipeline</h1>
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardContent className="pt-6">
            <p className="text-sm text-[#f85149]">Failed to load JobNimbus pipeline data.</p>
            <p className="mt-2 text-xs text-[#8b949e]">{error instanceof Error ? error.message : "Unknown error"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tradeFilterLabel = tradeFilter !== "all" 
    ? ` (${tradeFilterOptions.find(opt => opt.value === tradeFilter)?.label})` 
    : "";

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-[#e6edf3]">Pre-Sold Pipeline</h1>
          <p className="max-w-3xl text-sm text-[#8b949e]">
            Live pre-sold jobs in Lead and Estimating JobNimbus stages (Lead includes appointments). Excludes Production, AR, Completed stages, and Warranty jobs. Timing/conversion use full JN history.
          </p>
          {data && <p className="mt-2 text-xs text-[#484f58]">Updated {generatedLabel(data.generatedAt)} · timing cohort starts {data.cohortStart}{tradeFilter !== "all" && ` · ${tradeFilterOptions.find(opt => opt.value === tradeFilter)?.label}`}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={tradeFilter} onValueChange={(value) => setTradeFilter(value as TradeFilter)}>
            <SelectTrigger className="w-[210px] border-[#30363d] bg-[#161b22] text-[#e6edf3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#30363d] bg-[#161b22]">
              {tradeFilterOptions.map((option) => (
                <SelectItem 
                  key={option.value} 
                  value={option.value} 
                  className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
                >
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && <span className="text-xs text-[#8b949e]">{option.description}</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={recordType} onValueChange={setRecordType}>
            <SelectTrigger className="w-[210px] border-[#30363d] bg-[#161b22] text-[#e6edf3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#30363d] bg-[#161b22]">
              {recordTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-[#8b949e]">Active Jobs</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-16 bg-[#21262d]" /> : <p className="text-2xl font-bold text-[#e6edf3]">{data?.summary.activeJobs ?? 0}</p>}</CardContent>
        </Card>
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-[#8b949e]">Leads</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-16 bg-[#21262d]" /> : <p className="text-2xl font-bold text-[#58a6ff]">{data?.summary.leads ?? 0}</p>}</CardContent>
        </Card>
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-[#8b949e]">Estimating</CardTitle></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-16 bg-[#21262d]" /> : <p className="text-2xl font-bold text-[#d29922]">{data?.summary.estimating ?? 0}</p>}</CardContent>
        </Card>
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2">
            <InfoTooltip 
              label="Monthly Close Rate" 
              explanation={`Won jobs / total jobs created this month. Uses same definition as Sales page. Won statuses include Sold Job, Production, Invoicing, and Completed stages.${tradeFilter !== "all" ? ` Currently filtered to ${tradeFilterOptions.find(opt => opt.value === tradeFilter)?.label} jobs.` : ''}`}
            >
              <CardTitle className="text-xs text-[#8b949e]">Monthly Close Rate{tradeFilterLabel}</CardTitle>
            </InfoTooltip>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <Skeleton className="h-8 w-16 bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-2xl font-bold text-[#d29922]">{formatPercent(salesData?.summary.avgCloseRate ?? 0)}</p>
                {salesData && salesData.summary.totalJobs > 0 && (
                  <p className="text-xs text-[#8b949e]">
                    {salesData.summary.totalWon}/{salesData.summary.totalJobs}{tradeFilterLabel}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader className="pb-2"><InfoTooltip label="Open Value" explanation="JobNimbus value still in play. For Accounts Receivable this uses collectible AR due, not full historical job value. This is not QuickBooks."><CardTitle className="text-xs text-[#8b949e]">Open Value</CardTitle></InfoTooltip></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-24 bg-[#21262d]" /> : <p className="text-2xl font-bold text-[#e6edf3]">{formatCurrency(data?.summary.pipelineValue ?? 0)}</p>}</CardContent>
        </Card>
      </div>

      <Card className="mb-8 border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm text-[#e6edf3]">Where These Numbers Come From</CardTitle>
          <p className="text-xs text-[#8b949e]">Plain-English formulas for the headline cards. Source is the synced JobNimbus jobs table in Supabase, not QuickBooks.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Active Jobs</p>
              <p className="mt-2 font-mono text-lg text-[#e6edf3]">count(pre-sold jobs)</p>
              <p className="mt-2 text-xs text-[#8b949e]">Pre-sold job = {openJobFilter}.</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Open Value</p>
              <p className="mt-2 font-mono text-lg text-[#e6edf3]">sum(stage open value)</p>
              <p className="mt-2 text-xs text-[#8b949e]">AR rows use balance due. Non-AR rows use the best available JobNimbus value.</p>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">AR Due</p>
              <p className="mt-2 font-mono text-lg text-[#e6edf3]">sum(invoice balance due)</p>
              <p className="mt-2 text-xs text-[#8b949e]">Counts active JobNimbus invoices in Sent, Open, and Closed with balance due. This is collectible balance due, not full job size.</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Stage value equation</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[#8b949e]"><tr className="border-b border-[#30363d]"><th className="py-2 text-left">Stage</th><th className="text-right">Jobs</th><th className="text-right">Current value</th><th className="text-left pl-4">Formula</th></tr></thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={4} className="py-4"><Skeleton className="h-20 bg-[#21262d]" /></td></tr> : formulaStageRows.map((row) => (
                    <tr key={row.label} className="border-b border-[#21262d]">
                      <td className="py-2 text-[#e6edf3]">{row.label}</td>
                      <td className="py-2 text-right font-mono text-[#e6edf3]">{row.jobs}</td>
                      <td className="py-2 text-right font-mono text-[#e6edf3]">{formatCurrency(row.value)}</td>
                      <td className="py-2 pl-4 text-[#8b949e]">{row.formula}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Forecast equation</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[#8b949e]"><tr className="border-b border-[#30363d]"><th className="py-2 text-left">Bucket</th><th className="text-right">Raw value</th><th className="text-right">Weighted</th><th className="text-left pl-4">Equation</th></tr></thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={4} className="py-4"><Skeleton className="h-20 bg-[#21262d]" /></td></tr> : data?.forecastBuckets.map((bucket) => (
                    <tr key={bucket.bucket} className="border-b border-[#21262d]">
                      <td className="py-2 text-[#e6edf3]">{bucket.bucket}</td>
                      <td className="py-2 text-right font-mono text-[#e6edf3]">{formatCurrency(bucket.rawValue)}</td>
                      <td className="py-2 text-right font-mono text-[#e6edf3]">{formatCurrency(bucket.weightedValue)}</td>
                      <td className="py-2 pl-4 text-[#8b949e]">{forecastFormula(bucket.bucket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-[#8b949e]">JobNimbus stages: Lead (includes all pre-estimate statuses + appointments) and Estimating. Statuses sit underneath stages. The exact job-level rows are in Largest Pre-Sold Jobs at the bottom, and the status rollup is in Current Status Buckets.</p>
        </CardContent>
      </Card>

      {selectedRecordType && (
        <Card className="mb-8 border-[#30363d] bg-[#161b22]">
          <CardHeader><CardTitle className="text-sm text-[#e6edf3]">{selectedRecordType.label} Snapshot</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
            <div><p className="text-xs text-[#8b949e]">Leads</p><p className="font-bold text-[#e6edf3]">{stageCount(selectedRecordType, "leads")}</p></div>
            <div><p className="text-xs text-[#8b949e]">Scheduled</p><p className="font-bold text-[#e6edf3]">{stageCount(selectedRecordType, "appointmentsScheduled")}</p></div>
            <div><p className="text-xs text-[#8b949e]">Ran</p><p className="font-bold text-[#e6edf3]">{stageCount(selectedRecordType, "appointmentsRan")}</p></div>
            <div><p className="text-xs text-[#8b949e]">Estimating</p><p className="font-bold text-[#e6edf3]">{stageCount(selectedRecordType, "estimating")}</p></div>
            <div><p className="text-xs text-[#8b949e]">Production</p><p className="font-bold text-[#e6edf3]">{stageCount(selectedRecordType, "production")}</p></div>
            <div><p className="text-xs text-[#8b949e]">AR</p><p className="font-bold text-[#e6edf3]">{stageCount(selectedRecordType, "accountsReceivable")}</p></div>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-sm text-[#e6edf3]">Pre-Sold Jobs by JN Stage</CardTitle>
            <p className="text-xs text-[#8b949e]">JobNimbus Lead and Estimating stages (Lead includes appointments).</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[280px] bg-[#21262d]" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data?.currentStages ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid stroke="#30363d" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: "#8b949e", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<NumberTooltip />} cursor={{ fill: "rgba(88,166,255,0.08)" }} />
                  <Bar dataKey="jobCount" name="Jobs" radius={[4, 4, 0, 0]} fill="#58a6ff" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-sm text-[#e6edf3]">Pre-Sold Pipeline Value by Stage</CardTitle>
            <p className="text-xs text-[#8b949e]">Estimated value of pre-sold stages (Lead through Estimating).</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[280px] bg-[#21262d]" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data?.currentStages ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid stroke="#30363d" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: "#8b949e", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCurrency(v)} width={70} />
                  <Tooltip content={<CurrencyTooltip />} cursor={{ fill: "rgba(88,166,255,0.08)" }} />
                  <Bar dataKey="pipelineValue" name="Value" radius={[4, 4, 0, 0]} fill="#3fb950" />
                  <Bar dataKey="arDue" name="AR Due" radius={[4, 4, 0, 0]} fill="#d29922" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {isLoading ? recordTypeOptions.slice(1).map((option) => <Skeleton key={option.value} className="h-44 bg-[#21262d]" />) : data?.recordTypes.map((row) => (
          <Card key={row.recordType} className="border-[#30363d] bg-[#161b22]">
            <CardContent className="pt-6">
              <p className="mb-3 text-sm font-semibold text-[#e6edf3]">{row.label}</p>
              <p className="text-2xl font-bold text-[#e6edf3]">{row.activeJobs}</p>
              <p className="mb-4 text-xs text-[#8b949e]">active jobs · {formatCurrency(row.pipelineValue)}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-[#8b949e]">Lead</p><p className="font-mono text-[#e6edf3]">{row.stageCounts.leads}</p></div>
                <div><p className="text-[#8b949e]">Appt</p><p className="font-mono text-[#e6edf3]">{row.stageCounts.appointmentsScheduled}</p></div>
                <div><p className="text-[#8b949e]">Ran</p><p className="font-mono text-[#e6edf3]">{row.stageCounts.appointmentsRan}</p></div>
                <div><p className="text-[#8b949e]">Est</p><p className="font-mono text-[#e6edf3]">{row.stageCounts.estimating}</p></div>
                <div><p className="text-[#8b949e]">Prod</p><p className="font-mono text-[#e6edf3]">{row.stageCounts.production}</p></div>
                <div><p className="text-[#8b949e]">AR</p><p className="font-mono text-[#e6edf3]">{row.stageCounts.accountsReceivable}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-8 border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <InfoTooltip label="Pre-Sold Pipeline Forecast" explanation="Conservative V1 weights from current JobNimbus stage. Pre-sold stages only (Lead through Estimating). Use the timing/conversion tables below to calibrate this model as the history gets cleaner.">
            <CardTitle className="text-sm text-[#e6edf3]">Pre-Sold Pipeline Forecast</CardTitle>
          </InfoTooltip>
          <p className="text-xs text-[#8b949e]">Weighted forecast of pre-sold pipeline stages.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {isLoading ? [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 bg-[#21262d]" />) : data?.forecastBuckets.map((bucket) => (
              <div key={bucket.bucket} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
                <p className="mb-2 text-xs text-[#8b949e]">{bucket.bucket}</p>
                <p className="text-lg font-bold text-[#e6edf3]">{formatCurrency(bucket.weightedValue)}</p>
                <p className="mt-1 text-xs text-[#484f58]">{bucket.jobCount} jobs · raw {formatCurrency(bucket.rawValue)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-sm text-[#e6edf3]">Average Days by Stage Movement</CardTitle>
            <p className="text-xs text-[#8b949e]">Grouped by record type. Median and p75 matter more than the average when a job gets weird.</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[#8b949e]"><tr className="border-b border-[#30363d]"><th className="py-2 text-left">Type</th><th className="text-left">Move</th><th className="text-right">Avg</th><th className="text-right">Median</th><th className="text-right">P75</th><th className="text-right">N</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={6} className="py-6"><Skeleton className="h-24 bg-[#21262d]" /></td></tr> : stageTimingRows.map((row) => (
                  <tr key={`${row.recordType}-${row.fromStage}-${row.toStage}`} className="border-b border-[#21262d] text-xs">
                    <td className="py-2 text-[#e6edf3]">{row.recordTypeLabel}</td>
                    <td className="py-2 text-[#8b949e]">{row.fromStage} → {row.toStage}</td>
                    <td className="py-2 text-right font-mono text-[#e6edf3]">{daysLabel(row.avgDays)}</td>
                    <td className="py-2 text-right font-mono text-[#e6edf3]">{daysLabel(row.medianDays)}</td>
                    <td className="py-2 text-right font-mono text-[#e6edf3]">{daysLabel(row.p75Days)}</td>
                    <td className="py-2 text-right font-mono text-[#8b949e]">{row.sampleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-sm text-[#e6edf3]">Conversion Rates Between Statuses</CardTitle>
            <p className="text-xs text-[#8b949e]">Adjacent JobNimbus status movement by record type since {data?.cohortStart ?? "2026-01-21"}.</p>
          </CardHeader>
          <CardContent className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#161b22] text-xs text-[#8b949e]"><tr className="border-b border-[#30363d]"><th className="py-2 text-left">Type</th><th className="text-left">Status Move</th><th className="text-right">Rate</th><th className="text-right">Jobs</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={4} className="py-6"><Skeleton className="h-24 bg-[#21262d]" /></td></tr> : conversionRows.map((row) => (
                  <tr key={`${row.recordType}-${row.fromStatus}-${row.toStatus}`} className="border-b border-[#21262d] text-xs">
                    <td className="py-2 text-[#e6edf3]">{row.recordTypeLabel}</td>
                    <td className="py-2 text-[#8b949e]">{row.fromStatus} → {row.toStatus}</td>
                    <td className="py-2 text-right font-mono text-[#e6edf3]">{formatPercent(row.conversionRate)}</td>
                    <td className="py-2 text-right font-mono text-[#8b949e]">{row.convertedCount} / {row.fromCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8 border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm text-[#e6edf3]">Current Status Buckets</CardTitle>
          <p className="text-xs text-[#8b949e]">Every current JobNimbus status rolled up by record type, count, value, and average days sitting there.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[#8b949e]"><tr className="border-b border-[#30363d]"><th className="py-2 text-left">Stage</th><th className="text-left">Status</th><th className="text-left">Type</th><th className="text-right">Jobs</th><th className="text-right">Value</th><th className="text-right">AR Due</th><th className="text-right">Avg Age</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="py-6"><Skeleton className="h-28 bg-[#21262d]" /></td></tr> : statusRows.map((row) => (
                <tr key={`${row.recordType}-${row.statusName}`} className="border-b border-[#21262d] text-xs">
                  <td className="py-2"><span className="rounded-full px-2 py-1 text-[10px] font-semibold text-white" style={{ backgroundColor: stageColors[row.stage] ?? "#8b949e" }}>{row.stage}</span></td>
                  <td className="py-2 text-[#e6edf3]">{row.statusName}</td>
                  <td className="py-2 text-[#8b949e]">{row.recordTypeLabel}</td>
                  <td className="py-2 text-right font-mono text-[#e6edf3]">{row.jobCount}</td>
                  <td className="py-2 text-right font-mono text-[#e6edf3]">{formatCurrency(row.pipelineValue)}</td>
                  <td className="py-2 text-right font-mono text-[#3fb950]">{formatCurrency(row.arDue)}</td>
                  <td className="py-2 text-right font-mono text-[#8b949e]">{daysLabel(row.avgDaysInStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="mb-8 border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm text-[#e6edf3]">Status Timing Detail</CardTitle>
          <p className="text-xs text-[#8b949e]">Most common exact JobNimbus status transitions, with average, median, p75, and p90 days.</p>
        </CardHeader>
        <CardContent className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#161b22] text-xs text-[#8b949e]"><tr className="border-b border-[#30363d]"><th className="py-2 text-left">Type</th><th className="text-left">Status Move</th><th className="text-right">Avg</th><th className="text-right">Median</th><th className="text-right">P75</th><th className="text-right">P90</th><th className="text-right">N</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="py-6"><Skeleton className="h-28 bg-[#21262d]" /></td></tr> : statusTimingRows.map((row) => (
                <tr key={`${row.recordType}-${row.fromStatus}-${row.toStatus}`} className="border-b border-[#21262d] text-xs">
                  <td className="py-2 text-[#e6edf3]">{row.recordTypeLabel}</td>
                  <td className="py-2 text-[#8b949e]">{row.fromStatus} → {row.toStatus}</td>
                  <td className="py-2 text-right font-mono text-[#e6edf3]">{daysLabel(row.avgDays)}</td>
                  <td className="py-2 text-right font-mono text-[#e6edf3]">{daysLabel(row.medianDays)}</td>
                  <td className="py-2 text-right font-mono text-[#e6edf3]">{daysLabel(row.p75Days)}</td>
                  <td className="py-2 text-right font-mono text-[#e6edf3]">{daysLabel(row.p90Days)}</td>
                  <td className="py-2 text-right font-mono text-[#8b949e]">{row.sampleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm text-[#e6edf3]">Largest Pre-Sold Jobs</CardTitle>
          <p className="text-xs text-[#8b949e]">Top jobs in pre-sold stages (Lead through Estimating). Click through to JobNimbus.</p>
        </CardHeader>
        <CardContent className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#161b22] text-xs text-[#8b949e]"><tr className="border-b border-[#30363d]"><th className="py-2 text-left">Job</th><th className="text-left">Stage</th><th className="text-left">Status</th><th className="text-left">Type</th><th className="text-right">Value</th><th className="text-right">AR</th><th className="text-right">Age</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="py-6"><Skeleton className="h-28 bg-[#21262d]" /></td></tr> : data?.topJobs.map((job) => (
                <tr key={job.jobJnid} className="border-b border-[#21262d] text-xs">
                  <td className="max-w-[260px] truncate py-2 text-[#e6edf3]"><a href={job.jobUrl} target="_blank" rel="noreferrer" className="hover:text-[#58a6ff]">{job.jobName}</a></td>
                  <td className="py-2 text-[#8b949e]">{job.stage}</td>
                  <td className="py-2 text-[#8b949e]">{job.statusName}</td>
                  <td className="py-2 text-[#8b949e]">{job.recordTypeLabel}</td>
                  <td className="py-2 text-right font-mono text-[#e6edf3]">{formatCurrency(job.value)}</td>
                  <td className="py-2 text-right font-mono text-[#3fb950]">{formatCurrency(job.arDue)}</td>
                  <td className="py-2 text-right font-mono text-[#8b949e]">{job.daysInStatus}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {data && (
        <div className="mt-6 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Source Notes</p>
          <ul className="space-y-1 text-xs text-[#8b949e]">
            {data.sourceNotes.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
