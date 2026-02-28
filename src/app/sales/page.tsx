"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ConversionFunnel } from "@/components/ConversionFunnel";
import { InfoTooltip } from "@/components/InfoTooltip";
import { formatCurrency, formatPercent } from "@/lib/dates";
import { SEGMENTS, CHART_COLORS } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

/* -- Types ---------------------------------------------------------------- */

interface SalesPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
}

interface SalesSummary {
  totalRevenue: number;
  avgCloseRate: number;
  avgCycleTimeDays: number;
  activeReps: number;
  totalJobs: number;
  totalWon: number;
}

interface StatusConversion {
  fromStatus: string;
  toStatus: string;
  jobCount: number;
  conversionRate: number;
  avgDays: number;
}

interface FollowUpMetrics {
  avgAfterEstimate: number;
  avgAfterAppointment: number;
  jobsWithZeroFollowUp: number;
}

interface TimeBetweenStatus {
  fromStatus: string;
  toStatus: string;
  avgDays: number;
}

interface RepData {
  repId: string;
  repName: string;
  totalJobs: number;
  wonJobs: number;
  lostJobs: number;
  closeRate: number;
  avgCycleDays: number;
  revenue: number;
  segmentCloseRates: Record<string, number>;
  statusConversions: StatusConversion[];
  followUpMetrics: FollowUpMetrics;
  timeBetweenStatuses: TimeBetweenStatus[];
}

interface SalesData {
  period: SalesPeriod;
  filters: { segment: string | null; rep: string | null };
  summary: SalesSummary;
  reps: RepData[];
}

type SortField =
  | "repName"
  | "totalJobs"
  | "wonJobs"
  | "lostJobs"
  | "closeRate"
  | "revenue"
  | "avgCycleDays";

/* -- Helpers -------------------------------------------------------------- */

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; payload?: { fill?: string } }[];
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
            style={{ backgroundColor: entry.payload?.fill ?? CHART_COLORS[i] }}
          />
          {entry.name}: {formatPercent(entry.value)}
        </p>
      ))}
    </div>
  );
}

function conversionColor(rate: number): string {
  if (rate >= 80) return "#3fb950";
  if (rate >= 60) return "#58a6ff";
  if (rate >= 40) return "#d29922";
  return "#f85149";
}

/* -- Main Component ------------------------------------------------------- */

export default function SalesPage() {
  const [period, setPeriod] = useState("month");
  const [segment, setSegment] = useState<string>("all");
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  const segmentParam = segment === "all" ? "" : `&segment=${segment}`;

  const { data, isLoading, isError } = useQuery<SalesData>({
    queryKey: ["sales", period, segment],
    queryFn: async () => {
      const res = await fetch(`/api/sales?period=${period}${segmentParam}`);
      if (!res.ok) throw new Error("Failed to fetch sales data");
      return res.json();
    },
  });

  // Sorted reps
  const sortedReps = useMemo(() => {
    if (!data?.reps) return [];
    const reps = [...data.reps];
    reps.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortAsc
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return reps;
  }, [data?.reps, sortField, sortAsc]);

  // Selected rep
  const selectedRep = useMemo(() => {
    if (!data?.reps) return null;
    if (selectedRepId) return data.reps.find((r) => r.repId === selectedRepId) ?? null;
    return sortedReps[0] ?? null;
  }, [data?.reps, selectedRepId, sortedReps]);

  // Chart data for segment close rates
  const segmentChartData = useMemo(() => {
    if (!data?.reps) return [];
    const segKeys = Object.keys(SEGMENTS) as Segment[];
    return segKeys.map((segKey) => {
      const entry: Record<string, string | number> = {
        segment: SEGMENTS[segKey].label,
      };
      data.reps.forEach((rep) => {
        entry[rep.repName] = rep.segmentCloseRates[segKey] ?? 0;
      });
      return entry;
    });
  }, [data?.reps]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  function SortArrow({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return (
      <span className="ml-1 text-[#58a6ff]">{sortAsc ? "\u2191" : "\u2193"}</span>
    );
  }

  return (
    <div>
      {/* ---- Section 1: Header ------------------------------------------ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            Sales Performance
          </h1>
          <p className="text-sm text-[#8b949e]">
            Per-rep metrics -- close rates, revenue, cycle times, and follow-up
            patterns across all segments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="w-[160px] bg-[#161b22] border-[#30363d] text-[#e6edf3]">
              <SelectValue placeholder="All Segments" />
            </SelectTrigger>
            <SelectContent className="bg-[#161b22] border-[#30363d]">
              <SelectItem
                value="all"
                className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
              >
                All Segments
              </SelectItem>
              {(Object.entries(SEGMENTS) as [Segment, (typeof SEGMENTS)[Segment]][]).map(
                ([key, seg]) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="text-[#e6edf3] focus:bg-[#21262d] focus:text-[#e6edf3]"
                  >
                    {seg.icon} {seg.label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ---- Section 2: Summary KPIs ------------------------------------ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Revenue",
            explanation: "Sum of invoice amounts on each rep's jobs in this period (accrual basis — invoice date, not payment received)",
            value: data ? formatCurrency(data.summary.totalRevenue) : null,
          },
          {
            label: "Avg Close Rate",
            explanation: "Average close rate across all active reps. Close rate = jobs reaching Sold Job or beyond / total jobs assigned to rep",
            value: data ? formatPercent(data.summary.avgCloseRate) : null,
          },
          {
            label: "Avg Cycle Time",
            explanation: "Average days from job creation to Sold Job status across all reps (requires status history tracking)",
            value: data ? `${data.summary.avgCycleTimeDays} days` : null,
          },
          {
            label: "Active Reps",
            explanation: "Number of sales reps with at least one job assigned during this period",
            value: data ? String(data.summary.activeReps) : null,
          },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-[#161b22] border-[#30363d]">
            <CardHeader className="pb-2">
              <InfoTooltip label={kpi.label} explanation={kpi.explanation}>
                <CardTitle className="text-xs font-medium text-[#8b949e]">{kpi.label}</CardTitle>
              </InfoTooltip>
            </CardHeader>
            <CardContent>
              {isLoading || !kpi.value ? (
                <Skeleton className="h-8 w-24 bg-[#21262d]" />
              ) : (
                <p className="text-2xl font-bold text-[#e6edf3]">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ---- Section 3: Rep Leaderboard Table --------------------------- */}
      <Card className="bg-[#161b22] border-[#30363d] mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Rep Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-28 bg-[#21262d]" />
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <Skeleton key={j} className="h-5 w-14 bg-[#21262d] ml-auto" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[#30363d] hover:bg-transparent">
                  {(
                    [
                      { field: "repName" as SortField, label: "Rep Name", align: "left" },
                      { field: "totalJobs" as SortField, label: "Total Jobs", align: "right" },
                      { field: "wonJobs" as SortField, label: "Won", align: "right" },
                      { field: "lostJobs" as SortField, label: "Lost", align: "right" },
                      { field: "closeRate" as SortField, label: "Close Rate", align: "right" },
                      { field: "revenue" as SortField, label: "Revenue", align: "right" },
                      { field: "avgCycleDays" as SortField, label: "Avg Cycle Days", align: "right" },
                    ] as const
                  ).map((col) => (
                    <TableHead
                      key={col.field}
                      className={`text-[#8b949e] cursor-pointer select-none hover:text-[#e6edf3] transition-colors ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                      onClick={() => handleSort(col.field)}
                    >
                      {col.label}
                      <SortArrow field={col.field} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedReps.map((rep) => {
                  const isSelected = selectedRep?.repId === rep.repId;
                  return (
                    <TableRow
                      key={rep.repId}
                      className={`border-[#21262d] cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#58a6ff]/10 hover:bg-[#58a6ff]/15"
                          : "hover:bg-[#21262d]"
                      }`}
                      onClick={() => setSelectedRepId(rep.repId)}
                    >
                      <TableCell className="font-medium text-[#e6edf3]">
                        {rep.repName}
                        {isSelected && (
                          <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-[#58a6ff]" />
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[#e6edf3] tabular-nums">
                        {rep.totalJobs}
                      </TableCell>
                      <TableCell className="text-right text-green-400 tabular-nums">
                        {rep.wonJobs}
                      </TableCell>
                      <TableCell className="text-right text-red-400 tabular-nums">
                        {rep.lostJobs}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span style={{ color: conversionColor(rep.closeRate) }}>
                          {formatPercent(rep.closeRate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-[#e6edf3] font-medium tabular-nums">
                        {formatCurrency(rep.revenue)}
                      </TableCell>
                      <TableCell className="text-right text-[#8b949e] tabular-nums">
                        {rep.avgCycleDays}d
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sortedReps.length === 0 && (
                  <TableRow className="border-[#21262d]">
                    <TableCell
                      colSpan={7}
                      className="text-center text-[#8b949e] py-8"
                    >
                      No rep data for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---- Section 4: Segment Close Rate Grid ------------------------- */}
      <Card className="bg-[#161b22] border-[#30363d] mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-[#e6edf3]">
            Close Rate by Segment
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full bg-[#21262d]" />
          ) : sortedReps.length === 0 ? (
            <div className="flex items-center justify-center h-[280px]">
              <p className="text-sm text-[#8b949e]">No data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={segmentChartData}
                margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <XAxis
                  dataKey="segment"
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#8b949e", fontSize: 11 }}
                  axisLine={{ stroke: "#30363d" }}
                  tickLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(88,166,255,0.08)" }} />
                <Legend
                  verticalAlign="top"
                  height={32}
                  formatter={(value: string) => (
                    <span className="text-xs text-[#8b949e]">{value}</span>
                  )}
                />
                {data!.reps.map((rep, i) => (
                  <Bar
                    key={rep.repId}
                    dataKey={rep.repName}
                    name={rep.repName}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={32}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---- Section 5: Status-to-Status Conversions (Overall Pipeline) --- */}
      <ConversionFunnel period={period} segment={segment === "all" ? undefined : segment} />
      <div className="mb-6" />

      {/* ---- Section 6 & 7: Follow-Up Metrics + Time Between Statuses --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Follow-Up Metrics */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Follow-Up Metrics
              {selectedRep && (
                <span className="ml-2 text-xs font-normal text-[#58a6ff]">
                  {selectedRep.repName}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full bg-[#21262d]" />
                ))}
              </div>
            ) : !selectedRep ? (
              <p className="text-sm text-[#8b949e] py-4">
                Select a rep to view follow-up metrics
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-[#21262d] rounded-lg px-4 py-4">
                  <p className="text-xs text-[#8b949e] mb-1">
                    Avg Follow-ups After Estimate
                  </p>
                  <p className="text-xl font-bold text-[#e6edf3] tabular-nums">
                    {selectedRep.followUpMetrics.avgAfterEstimate.toFixed(1)}
                    <span className="text-sm font-normal text-[#8b949e] ml-1">
                      contacts
                    </span>
                  </p>
                </div>
                <div className="bg-[#21262d] rounded-lg px-4 py-4">
                  <p className="text-xs text-[#8b949e] mb-1">
                    Avg Follow-ups After Appointment
                  </p>
                  <p className="text-xl font-bold text-[#e6edf3] tabular-nums">
                    {selectedRep.followUpMetrics.avgAfterAppointment.toFixed(1)}
                    <span className="text-sm font-normal text-[#8b949e] ml-1">
                      contacts
                    </span>
                  </p>
                </div>
                <div className="bg-[#21262d] rounded-lg px-4 py-4">
                  <p className="text-xs text-[#8b949e] mb-1">
                    Jobs with Zero Follow-up
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    <span
                      className={
                        selectedRep.followUpMetrics.jobsWithZeroFollowUp > 0
                          ? "text-red-400"
                          : "text-green-400"
                      }
                    >
                      {selectedRep.followUpMetrics.jobsWithZeroFollowUp}
                    </span>
                    <span className="text-sm font-normal text-[#8b949e] ml-1">
                      jobs
                    </span>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time Between Statuses */}
        <Card className="bg-[#161b22] border-[#30363d]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#e6edf3]">
              Time Between Statuses
              {selectedRep && (
                <span className="ml-2 text-xs font-normal text-[#58a6ff]">
                  {selectedRep.repName}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full bg-[#21262d]" />
                ))}
              </div>
            ) : !selectedRep ? (
              <p className="text-sm text-[#8b949e] py-4">
                Select a rep to view timing data
              </p>
            ) : selectedRep.timeBetweenStatuses.length === 0 ? (
              <p className="text-sm text-[#8b949e] py-4">
                No timing data for {selectedRep.repName}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#8b949e]">From</TableHead>
                    <TableHead className="text-[#8b949e]" />
                    <TableHead className="text-[#8b949e]">To</TableHead>
                    <TableHead className="text-right text-[#8b949e]">
                      Avg Days
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRep.timeBetweenStatuses.map((row, idx) => (
                    <TableRow
                      key={idx}
                      className="border-[#21262d] hover:bg-[#21262d]"
                    >
                      <TableCell className="text-[#e6edf3] text-sm">
                        {row.fromStatus}
                      </TableCell>
                      <TableCell className="text-[#484f58] text-center">
                        &rarr;
                      </TableCell>
                      <TableCell className="text-[#e6edf3] text-sm">
                        {row.toStatus}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={
                            row.avgDays <= 2
                              ? "text-green-400"
                              : row.avgDays <= 5
                                ? "text-[#d29922]"
                                : "text-red-400"
                          }
                        >
                          {row.avgDays.toFixed(1)}d
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Error State ------------------------------------------------- */}
      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load sales data. Check your database connection and try
            again.
          </p>
        </div>
      )}
    </div>
  );
}
