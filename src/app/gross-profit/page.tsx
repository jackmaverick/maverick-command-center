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
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  | "materialsCost"
  | "laborCost"
  | "miscCost"
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

function accuracyLabel(status: GrossProfitJob["accuracyStatus"]): string {
  if (status === "accurate") return "Accurate";
  if (status === "needs_review") return "Needs Review";
  return "Not Final";
}

function accuracyClass(status: GrossProfitJob["accuracyStatus"]): string {
  if (status === "accurate") return "text-[#3fb950] bg-[#3fb950]/10";
  if (status === "needs_review") return "text-[#d29922] bg-[#d29922]/10";
  return "text-[#8b949e] bg-[#30363d]/60";
}

function blockerLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function SortHeader({
  field,
  children,
  onSort,
  className = "",
}: {
  field: SortField;
  children: React.ReactNode;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  return (
    <TableHead
      className={`text-[#8b949e] cursor-pointer hover:text-[#e6edf3] select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </TableHead>
  );
}

export default function GrossProfitPage() {
  const [period, setPeriod] = useState("last_60");
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
  }, [data, sortField, sortAsc, jobType]);

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
    const accurateJobCount = sortedJobs.filter((j) => j.accuracyStatus === "accurate").length;
    const needsReviewJobCount = sortedJobs.filter((j) => j.accuracyStatus === "needs_review").length;
    const notFinalJobCount = sortedJobs.filter((j) => j.accuracyStatus === "not_final").length;
    return {
      totalRevenue,
      totalCosts,
      totalGrossProfit,
      avgMarginPercent:
        totalRevenue > 0
          ? Math.round(((totalGrossProfit / totalRevenue) * 100) * 10) / 10
          : 0,
      jobCount: sortedJobs.length,
      accurateJobCount,
      needsReviewJobCount,
      notFinalJobCount,
      accuracyPercent:
        sortedJobs.length > 0
          ? Math.round((accurateJobCount / sortedJobs.length) * 1000) / 10
          : 0,
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

  const summary = jobType === "all" ? data?.summary : filteredSummary;
  const accuracyChartData = useMemo(() => {
    const source = summary ?? filteredSummary;
    return [
      { name: "Accurate", value: source.accurateJobCount, fill: "#3fb950" },
      { name: "Needs Review", value: source.needsReviewJobCount, fill: "#d29922" },
      { name: "Not Final", value: source.notFinalJobCount, fill: "#8b949e" },
    ];
  }, [filteredSummary, summary]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Gross Profit
          </h1>
          <p className="text-sm text-[#8b949e]">
            Final GP accuracy for recent completed and close-out jobs
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
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-8">
        {[
          {
            label: "Accurate",
            value: isLoading ? null : `${summary?.accurateJobCount ?? 0}/${summary?.jobCount ?? 0}`,
            colorClass: "text-[#3fb950]",
          },
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-6 mb-8">
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              GP Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  layout="vertical"
                  data={accuracyChartData}
                  margin={{ top: 4, right: 24, bottom: 4, left: 12 }}
                >
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: "#8b949e", fontSize: 11 }}
                    axisLine={{ stroke: "#30363d" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={92}
                    tick={{ fill: "#e6edf3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(88,166,255,0.08)" }}
                    contentStyle={{
                      backgroundColor: "#161b22",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      color: "#e6edf3",
                    }}
                    formatter={(value) => [`${value} jobs`, "Count"]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={30}>
                    {accuracyChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Accuracy Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: "Accurate",
                text: "Final/paid revenue and no GP blockers",
                dotClass: "bg-[#3fb950]",
                textClass: "text-[#3fb950]",
              },
              {
                label: "Needs Review",
                text: "Final revenue but work orders or supplier costs need review",
                dotClass: "bg-[#d29922]",
                textClass: "text-[#d29922]",
              },
              {
                label: "Not Final",
                text: "Invoice or job is not fully paid/closed yet",
                dotClass: "bg-[#8b949e]",
                textClass: "text-[#8b949e]",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
                <div>
                  <p className={`text-sm font-medium ${item.textClass}`}>{item.label}</p>
                  <p className="text-xs text-[#8b949e]">{item.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
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
                    <SortHeader field="dateCompleted" onSort={toggleSort}>Closed</SortHeader>
                    <SortHeader field="jobName" onSort={toggleSort}>Job</SortHeader>
                    <TableHead className="text-[#8b949e]">Job Type</TableHead>
                    <TableHead className="text-[#8b949e]">Record Type</TableHead>
                    <TableHead className="text-[#8b949e]">Accuracy</TableHead>
                    <SortHeader field="revenue" onSort={toggleSort} className="text-right">
                      Revenue
                    </SortHeader>
                    <SortHeader field="materialsCost" onSort={toggleSort} className="text-right">Materials</SortHeader>
                    <SortHeader field="laborCost" onSort={toggleSort} className="text-right">
                      Labor
                    </SortHeader>
                    <SortHeader field="miscCost" onSort={toggleSort} className="text-right">Misc Costs</SortHeader>
                    <SortHeader field="totalCost" onSort={toggleSort} className="text-right">
                      Total Cost
                    </SortHeader>
                    <SortHeader field="grossProfit" onSort={toggleSort} className="text-right">
                      Profit
                    </SortHeader>
                    <SortHeader field="marginPercent" onSort={toggleSort} className="text-right">
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
                              {(job.address || job.city) && (
                                <div className="text-xs text-[#8b949e] truncate">
                                  {[job.address, job.city].filter(Boolean).join(", ")}
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
                          <TableCell>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${accuracyClass(job.accuracyStatus)}`}
                            >
                              {accuracyLabel(job.accuracyStatus)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-[#e6edf3]">
                            {formatFullCurrency(job.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-[#8b949e]">
                            {job.materialsCost > 0
                              ? formatFullCurrency(job.materialsCost)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-[#8b949e]">
                            {job.laborCost > 0
                              ? formatFullCurrency(job.laborCost)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-[#8b949e]">
                            {job.miscCost > 0
                              ? formatFullCurrency(job.miscCost)
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
                            <TableCell colSpan={13} className="p-0">
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

      {/* Add Misc Cost Dialog */}
      <Dialog
        open={!!addCostJob}
        onOpenChange={(open) => !open && setAddCostJob(null)}
      >
        <DialogContent className="bg-[#161b22] border-[#30363d] text-[#e6edf3]">
          <DialogHeader>
            <DialogTitle>Add Misc Cost</DialogTitle>
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
              { label: "Materials", value: job.materialsCost },
              { label: "Labor (Work Orders)", value: job.laborCost },
              { label: "Misc Costs", value: job.miscCost },
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

        {/* Accuracy */}
        <div>
          <h4 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
            Accuracy
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[#8b949e]">Status</span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs font-medium ${accuracyClass(job.accuracyStatus)}`}
              >
                {accuracyLabel(job.accuracyStatus)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#8b949e]">GP confidence</span>
              <span className="text-[#e6edf3] capitalize">
                {blockerLabel(job.gpConfidence)}
              </span>
            </div>
            {job.gpBlockers.length > 0 && (
              <div>
                <span className="text-[#8b949e]">Blockers</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {job.gpBlockers.map((blocker) => (
                    <span
                      key={blocker}
                      className="rounded bg-[#d29922]/10 px-1.5 py-0.5 text-xs text-[#d29922]"
                    >
                      {blockerLabel(blocker)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {job.systemCostWarnings.length > 0 && (
              <div>
                <span className="text-[#8b949e]">Warnings</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {job.systemCostWarnings.map((warning) => (
                    <span
                      key={warning}
                      className="rounded bg-[#30363d] px-1.5 py-0.5 text-xs text-[#8b949e]"
                    >
                      {blockerLabel(warning)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Misc Costs */}
        <div className="md:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
              Misc Costs
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
              No misc costs entered yet.
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
