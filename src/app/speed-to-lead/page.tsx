"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodSelector } from "@/components/layout/period-selector";
import { InfoTooltip } from "@/components/InfoTooltip";
import { CHART_COLORS } from "@/lib/constants";

interface ResponseBucket {
  bucket: string;
  count: number;
  percent: number;
}

interface StageBucket {
  key: string;
  label: string;
  emoji: string;
  color: string;
  slaMinutes: number;
  statuses: readonly string[];
  totalInbound: number;
  avgResponseMinutes: number;
  hitSLACount: number;
  hitSLAPercent: number;
  missedCount: number;
  missedPercent: number;
  responseDistribution: ResponseBucket[];
}

interface RepResponseTime {
  repId: string;
  repName: string;
  avgMinutes: number;
  under5MinPercent: number;
  missedPercent: number;
  totalInbound: number;
}

interface PipelineVelocityStep {
  from: string;
  to: string;
  avgDays: number;
}

interface SpeedToLeadData {
  period: { key: string; label: string };
  summary: {
    totalTrackedInbound: number;
    unlinkedContacts: number;
    excludedContacts: number;
    staleLeadContacts: number;
    totalCycleDays: number;
  };
  unknownCalls: { touches: number; uniqueNumbers: number };
  buckets: StageBucket[];
  repResponseTimes: RepResponseTime[];
  pipelineVelocity: PipelineVelocityStep[];
}

function formatMinutes(min: number): string {
  if (min < 1) return "<1 min";
  if (min < 60) return `${min.toFixed(1)} min`;
  const hrs = Math.floor(min / 60);
  const remainder = Math.round(min % 60);
  if (hrs < 24) return `${hrs}h ${remainder}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function formatSLA(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${min / 60} hr`;
  return `${min / 1440} day${min === 1440 ? "" : "s"}`;
}

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
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function BucketSection({ bucket }: { bucket: StageBucket }) {
  const hitColor =
    bucket.hitSLAPercent >= 75
      ? "text-[#3fb950]"
      : bucket.hitSLAPercent >= 50
      ? "text-[#d29922]"
      : "text-[#f85149]";

  const chartData = bucket.responseDistribution.map((b, i) => ({
    ...b,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div
      className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6"
      style={{ borderLeft: `3px solid ${bucket.color}` }}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#e6edf3]">
            <span className="mr-2">{bucket.emoji}</span>
            {bucket.label}
          </h2>
          <p className="text-xs text-[#8b949e] mt-0.5">
            SLA: respond within {formatSLA(bucket.slaMinutes)} · Stages:{" "}
            {bucket.statuses.join(", ")}
          </p>
        </div>
        <span className="text-xs font-mono text-[#8b949e]">
          {bucket.totalInbound} inbound
        </span>
      </div>

      {bucket.totalInbound === 0 ? (
        <div className="h-24 flex items-center justify-center border border-dashed border-[#30363d] rounded-lg">
          <span className="text-sm text-[#8b949e]">
            No inbound touches in this stage for the period
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-[#0d1117] rounded-md p-3 border border-[#30363d]">
              <p className="text-[10px] uppercase tracking-wide text-[#8b949e] mb-1">
                Hit SLA
              </p>
              <p className={`text-xl font-bold ${hitColor}`}>
                {bucket.hitSLAPercent.toFixed(1)}%
              </p>
              <p className="text-[10px] text-[#484f58] mt-0.5">
                {bucket.hitSLACount} / {bucket.totalInbound}
              </p>
            </div>
            <div className="bg-[#0d1117] rounded-md p-3 border border-[#30363d]">
              <p className="text-[10px] uppercase tracking-wide text-[#8b949e] mb-1">
                Avg Response
              </p>
              <p className="text-xl font-bold text-[#58a6ff]">
                {formatMinutes(bucket.avgResponseMinutes)}
              </p>
            </div>
            <div className="bg-[#0d1117] rounded-md p-3 border border-[#30363d]">
              <p className="text-[10px] uppercase tracking-wide text-[#8b949e] mb-1">
                Missed (24h+)
              </p>
              <p
                className={`text-xl font-bold ${
                  bucket.missedPercent > 15
                    ? "text-[#f85149]"
                    : bucket.missedPercent > 5
                    ? "text-[#d29922]"
                    : "text-[#e6edf3]"
                }`}
              >
                {bucket.missedPercent.toFixed(1)}%
              </p>
              <p className="text-[10px] text-[#484f58] mt-0.5">
                {bucket.missedCount} contacts
              </p>
            </div>
            <div className="bg-[#0d1117] rounded-md p-3 border border-[#30363d]">
              <p className="text-[10px] uppercase tracking-wide text-[#8b949e] mb-1">
                Volume
              </p>
              <p className="text-xl font-bold text-[#e6edf3]">
                {bucket.totalInbound}
              </p>
              <p className="text-[10px] text-[#484f58] mt-0.5">contacts</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
            >
              <XAxis
                dataKey="bucket"
                tick={{ fill: "#8b949e", fontSize: 10 }}
                axisLine={{ stroke: "#30363d" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#8b949e", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(88,166,255,0.08)" }}
              />
              <Bar dataKey="count" name="Contacts" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-6"
        >
          <Skeleton className="h-4 w-40 bg-[#21262d] mb-4" />
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[1, 2, 3, 4].map((j) => (
              <Skeleton key={j} className="h-16 bg-[#21262d]" />
            ))}
          </div>
          <Skeleton className="h-40 bg-[#21262d]" />
        </div>
      ))}
    </div>
  );
}

export default function SpeedToLeadPage() {
  const [period, setPeriod] = useState("month");

  const { data, isLoading, isError } = useQuery<SpeedToLeadData>({
    queryKey: ["speed-to-lead", period],
    queryFn: async () => {
      const res = await fetch(`/api/speed-to-lead?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch speed-to-lead data");
      return res.json();
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">
            Speed to Lead
          </h1>
          <p className="text-[#8b949e]">
            Response time by pipeline stage — each stage has its own SLA.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Top-line counters */}
      {!isLoading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
            <div className="mb-1">
              <InfoTooltip
                label="Tracked Contacts"
                explanation="Unique JN contacts with at least one inbound touch in the period, whose current job status falls in one of the tracked buckets below."
              />
            </div>
            <p className="text-xl font-bold text-[#e6edf3]">
              {data.summary.totalTrackedInbound}
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
            <div className="mb-1">
              <InfoTooltip
                label="Stale Leads"
                explanation="Contacts re-engaging on old Lead-stage jobs — the JN contact was created more than 24h before this inbound. Counted separately so they don't drag down the 'New Lead' SLA."
              />
            </div>
            <p className="text-xl font-bold text-[#8b949e]">
              {data.summary.staleLeadContacts}
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
            <div className="mb-1">
              <InfoTooltip
                label="Unlinked"
                explanation="JN contacts that reached out but have no job attached. Often returning callers or contacts imported without a job."
              />
            </div>
            <p className="text-xl font-bold text-[#8b949e]">
              {data.summary.unlinkedContacts}
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
            <div className="mb-1">
              <InfoTooltip
                label="Excluded"
                explanation="Contacts on Dead / Lost / Cold / No Damage / Future Work jobs. Dropped from SLA math."
              />
            </div>
            <p className="text-xl font-bold text-[#8b949e]">
              {data.summary.excludedContacts}
            </p>
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
            <div className="mb-1">
              <InfoTooltip
                label="Unknown Numbers"
                explanation="Inbound calls/texts from phone numbers not linked to any JN contact. Likely spam, wrong numbers, or leads nobody added to JN yet."
              />
            </div>
            <p className="text-xl font-bold text-[#d29922]">
              {data.unknownCalls.uniqueNumbers}
            </p>
            <p className="text-[10px] text-[#484f58] mt-0.5">
              {data.unknownCalls.touches} touches
            </p>
          </div>
        </div>
      )}

      {/* Bucket sections */}
      {isLoading ? (
        <LoadingState />
      ) : (
        <div>
          {data?.buckets.map((bucket) => (
            <BucketSection key={bucket.key} bucket={bucket} />
          ))}
        </div>
      )}

      {/* Rep Response Times */}
      {!isLoading && data && data.repResponseTimes.length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Rep Response Times <span className="text-xs font-normal text-[#8b949e]">(across all tracked buckets)</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="pb-3 font-medium text-[#8b949e] text-left">Rep</th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Avg Response
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Under 5 Min
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Missed %
                  </th>
                  <th className="pb-3 font-medium text-[#8b949e] text-right">
                    Total Inbound
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.repResponseTimes.map((rep) => (
                  <tr key={rep.repId} className="border-b border-[#21262d]">
                    <td className="py-3 text-[#e6edf3] font-medium">{rep.repName}</td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {formatMinutes(rep.avgMinutes)}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`font-mono ${
                          rep.under5MinPercent >= 50
                            ? "text-[#3fb950]"
                            : rep.under5MinPercent >= 25
                            ? "text-[#d29922]"
                            : "text-[#f85149]"
                        }`}
                      >
                        {rep.under5MinPercent.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`font-mono ${
                          rep.missedPercent > 15
                            ? "text-[#f85149]"
                            : rep.missedPercent > 5
                            ? "text-[#d29922]"
                            : "text-[#3fb950]"
                        }`}
                      >
                        {rep.missedPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-[#8b949e]">
                      {rep.totalInbound}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pipeline Velocity */}
      {!isLoading && data && data.pipelineVelocity.length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-2">
            Pipeline Velocity
          </h2>
          <p className="text-xs text-[#8b949e] mb-4">
            Average time between key pipeline stages
          </p>
          <div className="space-y-2">
            {data.pipelineVelocity.map((step, i) => {
              const maxDays = Math.max(
                ...data.pipelineVelocity.map((s) => s.avgDays),
                1
              );
              const barPct = (step.avgDays / maxDays) * 100;
              return (
                <div
                  key={`${step.from}-${step.to}`}
                  className="flex items-center gap-3 bg-[#21262d] rounded px-3 py-2"
                >
                  <span className="text-xs text-[#e6edf3] w-64 shrink-0">
                    {step.from} → {step.to}
                  </span>
                  <div className="flex-1 h-2 bg-[#161b22] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-[#8b949e] w-16 text-right shrink-0">
                    {step.avgDays.toFixed(1)} days
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isError && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
          <p className="text-sm text-red-400">
            Failed to load speed-to-lead data. Check your database connection and try again.
          </p>
        </div>
      )}
    </div>
  );
}
