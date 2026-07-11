"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/dates";

interface DueDateRun {
  run_id: string;
  run_at: string;
  mode: string;
  case_count: number;
  needs_split_count: number;
  review_flag_count: number;
  write_eligible_count: number;
  ar_affected: string;
  is_current: boolean;
}

interface DueDateCase {
  invoice_number: string | null;
  invoice_status: string | null;
  job_name: string | null;
  job_number: string | null;
  customer: string | null;
  job_status: string | null;
  due_amount: string | null;
  invoice_total: string | null;
  current_due: string | null;
  proposed_due: string | null;
  days_delta: number | null;
  rule: string | null;
  scope: string | null;
  action: "write" | "split" | "review";
  flags: string[] | null;
  jn_job_url: string | null;
}

interface DueDatesData {
  run: DueDateRun | null;
  cases: DueDateCase[];
}

const ACTION_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  write: { label: "WRITE", color: "text-green-400", bg: "bg-green-500/20" },
  split: { label: "SPLIT", color: "text-purple-400", bg: "bg-purple-500/20" },
  review: { label: "REVIEW", color: "text-yellow-400", bg: "bg-yellow-500/20" },
};

const RULES = [
  "Due date = work-order date (per trade)",
  "COC sent → COC + 10 days",
  "Multi-trade → split per trade (supervised)",
  "Never writes a past date",
  "Only Draft/Open/Sent invoices",
];

function ruleChipLabel(rule: string | null): string {
  if (!rule) return "—";
  const r = rule.toLowerCase();
  if (r.includes("coc")) return "COC+10";
  return "WO date";
}

function num(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function DueDatesPage() {
  const { data, isLoading, isError, error } = useQuery<DueDatesData>({
    queryKey: ["due-dates"],
    queryFn: async () => {
      const res = await fetch("/api/financial/due-dates");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch due-date data");
      }
      return res.json();
    },
  });

  const run = data?.run;
  const cases = data?.cases ?? [];
  const splitCases = cases.filter((c) => c.action === "split");
  const isLive = run?.mode?.toLowerCase() === "live";

  const kpis = [
    { label: "Cases", value: run?.case_count ?? 0, color: "text-[#e6edf3]" },
    { label: "Write-eligible", value: run?.write_eligible_count ?? 0, color: "text-green-400" },
    { label: "Needs Split", value: run?.needs_split_count ?? 0, color: "text-purple-400" },
    { label: "Review", value: run?.review_flag_count ?? 0, color: "text-yellow-400" },
    { label: "$ AR Affected", value: formatCurrency(num(run?.ar_affected)), color: "text-[#e6edf3]" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
          Invoice Due Dates
        </h1>
        <p className="text-sm text-[#8b949e]">
          Due-date alignment loop &mdash; invoice due dates track the
          work-order schedule
        </p>
      </div>

      {isError && (
        <Card className="bg-[#161b22] border-red-500/40 mb-8">
          <CardContent className="pt-6">
            <p className="text-sm text-red-400">
              Failed to load due-date data:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-[#161b22] border-[#30363d]">
            <CardContent className="pt-6">
              {isLoading ? (
                <Skeleton className="h-12 w-full bg-[#21262d]" />
              ) : (
                <div>
                  <p className="text-xs text-[#8b949e] mb-1">{kpi.label}</p>
                  <p className={`text-2xl font-bold ${kpi.color}`}>
                    {kpi.value}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardContent className="pt-6">
            {isLoading ? (
              <Skeleton className="h-12 w-full bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-xs text-[#8b949e] mb-1">Mode / Last Run</p>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                    isLive
                      ? "bg-green-500/20 text-green-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {isLive ? "LIVE" : "DRY-RUN"}
                </span>
                <p className="text-xs text-[#8b949e] mt-1">
                  {run?.run_at
                    ? formatDate(run.run_at, "MMM d, yyyy h:mm a")
                    : "—"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rules chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {RULES.map((rule) => (
          <span
            key={rule}
            className="px-2.5 py-1 rounded-full text-[11px] bg-[#21262d] text-[#8b949e] border border-[#30363d]"
          >
            {rule}
          </span>
        ))}
      </div>

      {/* Case table */}
      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Cases {cases.length > 0 && `(${cases.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full bg-[#21262d]" />
              ))}
            </div>
          ) : !cases.length ? (
            <p className="text-sm text-[#8b949e] py-4 text-center">
              No due-date cases in the current run.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Invoice #</th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Customer / Job</th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Job Status</th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">Due $</th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Current → Proposed</th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Rule</th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Scope</th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Flags</th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c, i) => {
                    const actionInfo = ACTION_STYLES[c.action] ?? {
                      label: c.action?.toUpperCase() ?? "—",
                      color: "text-[#8b949e]",
                      bg: "bg-[#21262d]",
                    };
                    const later = (c.days_delta ?? 0) >= 0;
                    return (
                      <tr
                        key={`${c.invoice_number}-${i}`}
                        className="border-b border-[#21262d] hover:bg-[#21262d]/50"
                      >
                        <td className="py-2 px-2 text-[#8b949e] font-mono">
                          {c.invoice_number ?? "—"}
                        </td>
                        <td className="py-2 px-2 max-w-[220px]">
                          {c.jn_job_url ? (
                            <a
                              href={c.jn_job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#58a6ff] hover:underline truncate block"
                            >
                              {c.job_name ?? c.job_number ?? "—"}
                            </a>
                          ) : (
                            <span className="text-[#e6edf3] truncate block">
                              {c.job_name ?? c.job_number ?? "—"}
                            </span>
                          )}
                          <span className="text-[#8b949e] text-[10px] truncate block">
                            {c.customer ?? "—"}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-[#8b949e]">
                          {c.job_status ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-right text-[#e6edf3] font-mono tabular-nums">
                          {c.due_amount !== null
                            ? formatCurrency(num(c.due_amount))
                            : "—"}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <span className="text-[#8b949e] line-through">
                            {c.current_due
                              ? formatDate(c.current_due)
                              : "none"}
                          </span>
                          <span className="text-[#8b949e] mx-1.5">→</span>
                          <span
                            className={`font-semibold ${
                              later ? "text-green-400" : "text-yellow-400"
                            }`}
                          >
                            {c.proposed_due
                              ? formatDate(c.proposed_due)
                              : "—"}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#21262d] text-[#8b949e] border border-[#30363d]">
                            {ruleChipLabel(c.rule)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-[#8b949e] max-w-[140px] truncate">
                          {c.scope ?? "—"}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex flex-wrap gap-1">
                            {(c.flags ?? []).map((f) => (
                              <span
                                key={f}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-400"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${actionInfo.bg} ${actionInfo.color}`}
                          >
                            {actionInfo.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Needs Split list */}
      <Card className="bg-[#161b22] border-[#30363d] mb-8">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Needs Split (supervised &mdash; never auto-written)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-full bg-[#21262d]" />
          ) : !splitCases.length ? (
            <p className="text-sm text-[#8b949e] py-2">
              No multi-trade invoices need splitting in the current run.
            </p>
          ) : (
            <ul className="space-y-2">
              {splitCases.map((c, i) => (
                <li
                  key={`split-${c.invoice_number}-${i}`}
                  className="text-sm text-[#e6edf3]"
                >
                  Split{" "}
                  <span className="font-mono text-purple-400">
                    #{c.invoice_number}
                  </span>{" "}
                  into per-trade invoices ({c.scope ?? "unknown scope"})
                  {" — "}
                  <span className="font-mono tabular-nums">
                    {formatCurrency(num(c.due_amount))}
                  </span>
                  {" — "}
                  {c.jn_job_url ? (
                    <a
                      href={c.jn_job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#58a6ff] hover:underline"
                    >
                      {c.job_name ?? c.job_number ?? "job"}
                    </a>
                  ) : (
                    <span>{c.job_name ?? c.job_number ?? "job"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-[#8b949e] mb-8">
        No reliable JobNimbus invoice deep link exists; rows link to the job
        page (Financials tab). Loop is gated dry-run; writes require
        DUE_DATE_LOOP_MODE=live.
      </p>
    </div>
  );
}
