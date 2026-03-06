"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PeriodSelector } from "@/components/layout/period-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEGMENTS } from "@/lib/constants";
import { formatCurrency, formatPercent, formatDate } from "@/lib/dates";
import type { GrossProfitData, GrossProfitJob, RetailCostEntry } from "@/types";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ArrowUpDown,
} from "lucide-react";

type SortField =
  | "jobName"
  | "dateCompleted"
  | "revenue"
  | "supplierCost"
  | "laborCost"
  | "retailCost"
  | "totalCost"
  | "grossProfit"
  | "marginPercent";

function marginColor(pct: number): string {
  if (pct >= 40) return "text-[#3fb950]";
  if (pct >= 25) return "text-[#d29922]";
  return "text-[#f85149]";
}

function marginBg(pct: number): string {
  if (pct >= 40) return "bg-[#3fb950]/10";
  if (pct >= 25) return "bg-[#d29922]/10";
  return "bg-[#f85149]/10";
}

function formatFullCurrency(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function GrossProfitPage() {
  const [period, setPeriod] = useState("all");
  const [segment, setSegment] = useState<string>("all");
  const [jobType, setJobType] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("dateCompleted");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [addCostJob, setAddCostJob] = useState<string | null>(null);
  const [costForm, setCostForm] = useState({
    store_name: "Home Depot",
    amount: "",
    description: "",
    purchase_date: "",
  });

  const queryClient = useQueryClient();
  const segmentParam = segment === "all" ? "" : `&segment=${segment}`;

  const { data, isLoading, isError } = useQuery<GrossProfitData>({
    queryKey: ["gross-profit", period, segment],
    queryFn: async () => {
      const res = await fetch(
        `/api/gross-profit?period=${period}${segmentParam}`
      );
      if (!res.ok) throw new Error("Failed to fetch gross profit data");
      return res.json();
    },
  });

  // Fetch retail costs for expanded job
  const { data: retailCosts } = useQuery<{ costs: RetailCostEntry[] }>({
    queryKey: ["retail-costs", expandedJob],
    queryFn: async () => {
      const res = await fetch(
        `/api/gross-profit/retail-costs?job_jnid=${expandedJob}`
      );
      if (!res.ok) throw new Error("Failed to fetch retail costs");
      return res.json();
    },
    enabled: !!expandedJob,
  });

  const sortedJobs = useMemo(() => {
    if (!data?.jobs) return [];
    const filtered =
      jobType === "all"
        ? data.jobs
        : data.jobs.filter((j) => j.jobTypes.includes(jobType));
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      // Handle nullable date strings
      if (sortField === "dateCompleted") {
        const aTime = aVal ? new Date(aVal as string).getTime() : 0;
        const bTime = bVal ? new Date(bVal as string).getTime() : 0;
        return sortAsc ? aTime - bTime : bTime - aTime;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortAsc
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data?.jobs, sortField, sortAsc, jobType]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortAsc(!sortAsc);
      } else {
        setSortField(field);
        setSortAsc(false);
      }
    },
    [sortField, sortAsc]
  );

  // Recalculate summary from filtered/sorted jobs
  const filteredSummary = useMemo(() => {
    const totalRevenue = sortedJobs.reduce((s, j) => s + j.revenue, 0);
    const totalCosts = sortedJobs.reduce((s, j) => s + j.totalCost, 0);
    const totalGrossProfit = totalRevenue - totalCosts;
    return {
      totalRevenue,
      totalCosts,
      totalGrossProfit,
      avgMarginPercent:
        totalRevenue > 0
          ? Math.round(((totalGrossProfit / totalRevenue) * 100) * 10) / 10
          : 0,
      jobCount: sortedJobs.length,
    };
  }, [sortedJobs]);

  const handleAddCost = async () => {
    if (!addCostJob || !costForm.amount) return;
    await fetch("/api/gross-profit/retail-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_jnid: addCostJob,
        store_name: costForm.store_name,
        amount: parseFloat(costForm.amount),
        description: costForm.description || null,
        purchase_date: costForm.purchase_date || null,
      }),
    });
    setCostForm({ store_name: "Home Depot", amount: "", description: "", purchase_date: "" });
    setAddCostJob(null);
    queryClient.invalidateQueries({ queryKey: ["gross-profit"] });
    queryClient.invalidateQueries({ queryKey: ["retail-costs"] });
  };

  const handleDeleteCost = async (id: string) => {
    await fetch(`/api/gross-profit/retail-costs?id=${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["gross-profit"] });
    queryClient.invalidateQueries({ queryKey: ["retail-costs"] });
  };

  const SortHeader = ({
    field,
    children,
    className = "",
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead
      className={`text-[#8b949e] cursor-pointer hover:text-[#e6edf3] select-none ${className}`}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </TableHead>
  );

  const summary = jobType === "all" ? data?.summary : filteredSummary;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Gross Profit
          </h1>
          <p className="text-sm text-[#8b949e]">
            Job-level profitability for completed &amp; paid jobs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="w-[140px] bg-[#161b22] border-[#30363d] text-[#e6edf3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#161b22] border-[#30363d]">
              <SelectItem
                value="all"
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
              >
                All Segments
              </SelectItem>
              {Object.entries(SEGMENTS).map(([key, seg]) => (
                <SelectItem
                  key={key}
                  value={key}
                  className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
                >
                  {seg.icon} {seg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={jobType} onValueChange={setJobType}>
            <SelectTrigger className="w-[140px] bg-[#161b22] border-[#30363d] text-[#e6edf3]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#161b22] border-[#30363d]">
              <SelectItem
                value="all"
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
              >
                All Job Types
              </SelectItem>
              {["Roof", "Siding", "Gutters", "Windows", "Repair"].map((t) => (
                <SelectItem
                  key={t}
                  value={t}
                  className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
                >
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {[
          {
            label: "Revenue",
            value: isLoading ? null : formatCurrency(summary?.totalRevenue ?? 0),
          },
          {
            label: "Total Costs",
            value: isLoading ? null : formatCurrency(summary?.totalCosts ?? 0),
          },
          {
            label: "Gross Profit",
            value: isLoading ? null : formatCurrency(summary?.totalGrossProfit ?? 0),
            colorClass: summary
              ? marginColor(summary.avgMarginPercent)
              : undefined,
          },
          {
            label: "Avg Margin",
            value: isLoading ? null : formatPercent(summary?.avgMarginPercent ?? 0),
            colorClass: summary
              ? marginColor(summary.avgMarginPercent)
              : undefined,
          },
          {
            label: "Jobs",
            value: isLoading ? null : (summary?.jobCount ?? 0).toString(),
          },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-[#161b22] border-[#30363d]">
            <CardContent className="p-4">
              <p className="text-xs text-[#8b949e] mb-1">{kpi.label}</p>
              {kpi.value === null ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p
                  className={`text-2xl font-bold ${kpi.colorClass ?? "text-[#e6edf3]"}`}
                >
                  {kpi.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Job Table */}
      <Card className="bg-[#161b22] border-[#30363d]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Job Profitability
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sortedJobs.length === 0 ? (
            <p className="text-sm text-[#8b949e] py-8 text-center">
              No completed jobs found for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <SortHeader field="dateCompleted">Closed</SortHeader>
                    <SortHeader field="jobName">Job</SortHeader>
                    <TableHead className="text-[#8b949e]">Job Type</TableHead>
                    <TableHead className="text-[#8b949e]">Record Type</TableHead>
                    <SortHeader field="revenue" className="text-right">
                      Revenue
                    </SortHeader>
                    <SortHeader field="supplierCost" className="text-right">
                      Supplier
                    </SortHeader>
                    <SortHeader field="laborCost" className="text-right">
                      Labor
                    </SortHeader>
                    <SortHeader field="retailCost" className="text-right">
                      Retail
                    </SortHeader>
                    <SortHeader field="totalCost" className="text-right">
                      Total Cost
                    </SortHeader>
                    <SortHeader field="grossProfit" className="text-right">
                      Profit
                    </SortHeader>
                    <SortHeader field="marginPercent" className="text-right">
                      Margin
                    </SortHeader>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedJobs.map((job) => {
                    const isExpanded = expandedJob === job.jobJnid;
                    const segInfo =
                      SEGMENTS[job.segment as keyof typeof SEGMENTS];
                    return (
                      <>
                        <TableRow
                          key={job.jobJnid}
                          className="border-[#30363d] hover:bg-[#21262d] cursor-pointer"
                          onClick={() =>
                            setExpandedJob(isExpanded ? null : job.jobJnid)
                          }
                        >
                          <TableCell className="text-xs text-[#8b949e] whitespace-nowrap">
                            {job.dateCompleted
                              ? formatDate(job.dateCompleted, "MMM d")
                              : "—"}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            <div>
                              <a
                                href={`https://app.jobnimbus.com/job/${job.jobJnid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#58a6ff] hover:underline truncate block"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {job.jobName}
                              </a>
                              {job.address && (
                                <div className="text-xs text-[#8b949e] truncate">
                                  {job.address}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {job.jobTypes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {job.jobTypes.map((t) => (
                                  <span
                                    key={t}
                                    className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#30363d] text-[#8b949e]"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-[#484f58]">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {segInfo ? (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{
                                  color: segInfo.color,
                                  backgroundColor: `${segInfo.color}15`,
                                }}
                              >
                                {segInfo.label}
                              </span>
                            ) : (
                              <span className="text-xs text-[#484f58]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[#e6edf3]">
                            {formatFullCurrency(job.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-[#8b949e]">
                            {job.supplierCost > 0
                              ? formatFullCurrency(job.supplierCost)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-[#8b949e]">
                            {job.laborCost > 0
                              ? formatFullCurrency(job.laborCost)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-[#8b949e]">
                            {job.retailCost > 0
                              ? formatFullCurrency(job.retailCost)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-[#e6edf3]">
                            {formatFullCurrency(job.totalCost)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${marginColor(job.marginPercent)}`}
                          >
                            {formatFullCurrency(job.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${marginColor(job.marginPercent)} ${marginBg(job.marginPercent)}`}
                            >
                              {job.marginPercent.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-[#8b949e]" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-[#8b949e]" />
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <TableRow
                            key={`${job.jobJnid}-detail`}
                            className="border-[#30363d] hover:bg-transparent"
                          >
                            <TableCell colSpan={12} className="p-0">
                              <ExpandedDetail
                                job={job}
                                retailCosts={retailCosts?.costs ?? []}
                                onAddCost={() => setAddCostJob(job.jobJnid)}
                                onDeleteCost={handleDeleteCost}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400 text-sm">
            Failed to load gross profit data. Check the console for details.
          </p>
        </div>
      )}

      {/* Add Retail Cost Dialog */}
      <Dialog
        open={!!addCostJob}
        onOpenChange={(open) => !open && setAddCostJob(null)}
      >
        <DialogContent className="bg-[#161b22] border-[#30363d] text-[#e6edf3]">
          <DialogHeader>
            <DialogTitle>Add Retail/Misc Cost</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Store</label>
              <Select
                value={costForm.store_name}
                onValueChange={(v) =>
                  setCostForm((f) => ({ ...f, store_name: v }))
                }
              >
                <SelectTrigger className="bg-[#0d1117] border-[#30363d] text-[#e6edf3]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#161b22] border-[#30363d]">
                  {["Home Depot", "Lowe's", "Menards", "Other"].map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
                    >
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">
                Amount ($)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={costForm.amount}
                onChange={(e) =>
                  setCostForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="bg-[#0d1117] border-[#30363d] text-[#e6edf3]"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">
                Description (optional)
              </label>
              <Input
                placeholder="What was purchased"
                value={costForm.description}
                onChange={(e) =>
                  setCostForm((f) => ({ ...f, description: e.target.value }))
                }
                className="bg-[#0d1117] border-[#30363d] text-[#e6edf3]"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">
                Purchase Date (optional)
              </label>
              <Input
                type="date"
                value={costForm.purchase_date}
                onChange={(e) =>
                  setCostForm((f) => ({
                    ...f,
                    purchase_date: e.target.value,
                  }))
                }
                className="bg-[#0d1117] border-[#30363d] text-[#e6edf3]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setAddCostJob(null)}
                className="border-[#30363d] text-[#8b949e] hover:bg-[#21262d]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddCost}
                disabled={!costForm.amount}
                className="bg-[#58a6ff] text-white hover:bg-[#58a6ff]/90"
              >
                Add Cost
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Expanded detail section for a job row
function ExpandedDetail({
  job,
  retailCosts,
  onAddCost,
  onDeleteCost,
}: {
  job: GrossProfitJob;
  retailCosts: RetailCostEntry[];
  onAddCost: () => void;
  onDeleteCost: (id: string) => void;
}) {
  return (
    <div className="bg-[#0d1117] border-t border-[#30363d] px-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cost Breakdown */}
        <div>
          <h4 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
            Cost Breakdown
          </h4>
          <div className="space-y-2">
            {[
              { label: "Supplier Materials", value: job.supplierCost },
              { label: "Labor (Work Orders)", value: job.laborCost },
              { label: "Retail/Misc", value: job.retailCost },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-[#8b949e]">{item.label}</span>
                <span className="text-[#e6edf3]">
                  {item.value > 0 ? formatFullCurrency(item.value) : "—"}
                </span>
              </div>
            ))}
            <div className="border-t border-[#30363d] pt-2 flex items-center justify-between text-sm font-medium">
              <span className="text-[#8b949e]">Total Cost</span>
              <span className="text-[#e6edf3]">
                {formatFullCurrency(job.totalCost)}
              </span>
            </div>
          </div>
        </div>

        {/* Profit Summary */}
        <div>
          <h4 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
            Profit Summary
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8b949e]">Revenue</span>
              <span className="text-[#e6edf3]">
                {formatFullCurrency(job.revenue)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8b949e]">Total Cost</span>
              <span className="text-[#e6edf3]">
                {formatFullCurrency(job.totalCost)}
              </span>
            </div>
            <div className="border-t border-[#30363d] pt-2 flex items-center justify-between text-sm font-medium">
              <span className="text-[#8b949e]">Gross Profit</span>
              <span className={marginColor(job.marginPercent)}>
                {formatFullCurrency(job.grossProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8b949e]">Margin</span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs font-medium ${marginColor(job.marginPercent)} ${marginBg(job.marginPercent)}`}
              >
                {job.marginPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Retail Costs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
              Retail Costs
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddCost();
              }}
              className="flex items-center gap-1 text-xs text-[#58a6ff] hover:text-[#58a6ff]/80"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {retailCosts.length === 0 ? (
            <p className="text-xs text-[#484f58]">
              No retail costs entered yet.
            </p>
          ) : (
            <div className="space-y-2">
              {retailCosts.map((cost) => (
                <div
                  key={cost.id}
                  className="flex items-center justify-between text-sm group"
                >
                  <div>
                    <span className="text-[#8b949e]">{cost.storeName}</span>
                    {cost.description && (
                      <span className="text-[#484f58] text-xs ml-2">
                        {cost.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#e6edf3]">
                      ${cost.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCost(cost.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-[#f85149] hover:text-[#f85149]/80"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
