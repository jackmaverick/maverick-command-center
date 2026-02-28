"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/dates";
import type { ReconciliationSummary, InvoiceReconRow } from "@/types";

type StatusFilter = "all" | "matched" | "missing_in_qb" | "missing_in_jn" | "amount_mismatch" | "flagged";

interface ReconData {
  summary: ReconciliationSummary;
  invoiceRows: InvoiceReconRow[];
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  matched: { label: "Matched", color: "text-green-400", bg: "bg-green-500/20" },
  missing_in_qb: { label: "Missing in QB", color: "text-red-400", bg: "bg-red-500/20" },
  missing_in_jn: { label: "Missing in JN", color: "text-red-400", bg: "bg-red-500/20" },
  amount_mismatch: { label: "Amount Mismatch", color: "text-yellow-400", bg: "bg-yellow-500/20" },
  flagged: { label: "Flagged", color: "text-purple-400", bg: "bg-purple-500/20" },
};

export default function ReconciliationPage() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<ReconData>({
    queryKey: ["reconciliation", filter],
    queryFn: async () => {
      const res = await fetch(
        `/api/financial/reconciliation?status=${filter}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch reconciliation data");
      }
      return res.json();
    },
  });

  const runMatchingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/financial/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_matching" }),
      });
      if (!res.ok) throw new Error("Failed to run matching");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      mappingId,
      status,
    }: {
      mappingId: string;
      status: "matched" | "flagged";
    }) => {
      const res = await fetch("/api/financial/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", mappingId, status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    },
  });

  const summary = data?.summary;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Reconciliation
          </h1>
          <p className="text-sm text-[#8b949e]">
            Match JN invoices with QuickBooks records
          </p>
        </div>
        <button
          onClick={() => runMatchingMutation.mutate()}
          disabled={runMatchingMutation.isPending}
          className="px-4 py-2 text-sm font-medium rounded-md bg-[#58a6ff]/10 text-[#58a6ff] hover:bg-[#58a6ff]/20 disabled:opacity-50 transition-colors"
        >
          {runMatchingMutation.isPending ? "Matching..." : "Run Matching"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardContent className="pt-6">
            {isLoading ? (
              <Skeleton className="h-12 w-full bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-xs text-[#8b949e] mb-1">Matched</p>
                <p className="text-2xl font-bold text-green-400">
                  {summary?.matched ?? 0}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardContent className="pt-6">
            {isLoading ? (
              <Skeleton className="h-12 w-full bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-xs text-[#8b949e] mb-1">Missing in QB</p>
                <p className="text-2xl font-bold text-red-400">
                  {summary?.missingInQB ?? 0}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardContent className="pt-6">
            {isLoading ? (
              <Skeleton className="h-12 w-full bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-xs text-[#8b949e] mb-1">Missing in JN</p>
                <p className="text-2xl font-bold text-red-400">
                  {summary?.missingInJN ?? 0}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardContent className="pt-6">
            {isLoading ? (
              <Skeleton className="h-12 w-full bg-[#21262d]" />
            ) : (
              <div>
                <p className="text-xs text-[#8b949e] mb-1">Mismatches</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {summary?.amountMismatches ?? 0}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-[#161b22] border border-[#30363d] rounded-lg p-1 mb-6 w-fit">
        {(
          [
            { key: "all", label: "All" },
            { key: "matched", label: "Matched" },
            { key: "missing_in_qb", label: "Missing in QB" },
            { key: "missing_in_jn", label: "Missing in JN" },
            { key: "amount_mismatch", label: "Mismatches" },
            { key: "flagged", label: "Flagged" },
          ] as { key: StatusFilter; label: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === tab.key
                ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                : "text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Invoice Reconciliation Table */}
      <Card className="bg-[#161b22] border-[#30363d]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Invoice Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full bg-[#21262d]" />
              ))}
            </div>
          ) : !data?.invoiceRows?.length ? (
            <p className="text-sm text-[#8b949e] py-4 text-center">
              {filter === "all"
                ? "No invoices to reconcile. Run a QBO sync first."
                : `No invoices with status "${filter}"`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#30363d]">
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                      Status
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                      Customer
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                      JN #
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                      JN Amount
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                      QB #
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                      QB Amount
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[#8b949e]">
                      Diff
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                      Match
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-[#8b949e]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoiceRows.map((row) => {
                    const statusInfo = STATUS_LABELS[row.status] ?? {
                      label: row.status,
                      color: "text-[#8b949e]",
                      bg: "bg-[#21262d]",
                    };
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-[#21262d] hover:bg-[#21262d]/50"
                      >
                        <td className="py-2 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.bg} ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-[#e6edf3] truncate max-w-[150px]">
                          {row.customerName ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-[#8b949e] font-mono">
                          {row.jnDocNumber ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-right text-[#e6edf3] font-mono tabular-nums">
                          {row.jnAmount !== null
                            ? formatCurrency(row.jnAmount)
                            : "—"}
                        </td>
                        <td className="py-2 px-2 text-[#8b949e] font-mono">
                          {row.qboDocNumber ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-right text-[#e6edf3] font-mono tabular-nums">
                          {row.qboAmount !== null
                            ? formatCurrency(row.qboAmount)
                            : "—"}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums">
                          {row.amountDifference !== null &&
                          Math.abs(row.amountDifference) > 0.01 ? (
                            <span className="text-yellow-400">
                              {row.amountDifference > 0 ? "+" : ""}
                              {formatCurrency(row.amountDifference)}
                            </span>
                          ) : row.amountDifference !== null ? (
                            <span className="text-green-400">$0</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {row.matchConfidence !== null && (
                            <div className="flex items-center gap-1">
                              <div className="w-12 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    row.matchConfidence >= 0.9
                                      ? "bg-green-500"
                                      : row.matchConfidence >= 0.7
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                                  }`}
                                  style={{
                                    width: `${row.matchConfidence * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[#8b949e] text-[10px]">
                                {Math.round(row.matchConfidence * 100)}%
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {row.matchConfidence !== null && (
                            <div className="flex gap-1">
                              {row.status !== "matched" && (
                                <button
                                  onClick={() =>
                                    updateStatusMutation.mutate({
                                      mappingId: row.id,
                                      status: "matched",
                                    })
                                  }
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20"
                                >
                                  Approve
                                </button>
                              )}
                              {row.status !== "flagged" && (
                                <button
                                  onClick={() =>
                                    updateStatusMutation.mutate({
                                      mappingId: row.id,
                                      status: "flagged",
                                    })
                                  }
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                                >
                                  Flag
                                </button>
                              )}
                            </div>
                          )}
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

      {/* Match Result Toast */}
      {runMatchingMutation.isSuccess && (
        <div className="fixed bottom-4 right-4 bg-[#161b22] border border-green-500/20 rounded-lg px-4 py-3 shadow-lg">
          <p className="text-sm text-green-400">
            Matching complete: {runMatchingMutation.data?.newMatches ?? 0} new
            matches found
          </p>
        </div>
      )}

      {isError && (
        <div className="mt-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 text-center">
          <p className="text-sm text-yellow-400 mb-2">
            Unable to load reconciliation data. QuickBooks may not be connected.
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
