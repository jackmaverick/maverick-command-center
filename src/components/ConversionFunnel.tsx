"use client";

import { useQuery } from "@tanstack/react-query";

interface Conversion {
  from: string | string[];
  to: string | string[];
  label: string;
  converted_jobs: number;
  from_status_jobs: number;
  conversion_rate: number;
  avg_days: number | null;
  basis?: string;
}

interface RecordTypeChange {
  fromType: string;
  toType: string;
  changedJobs: number;
}

export function ConversionFunnel({
  period,
  segment,
  repJnid,
}: {
  period: string;
  segment?: string;
  repJnid?: string;
}) {
  const queryParams = new URLSearchParams({
    period,
    ...(segment && segment !== "all" && { segment }),
    ...(repJnid && { rep_jnid: repJnid }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversions", period, segment, repJnid],
    queryFn: async () => {
      const res = await fetch(`/api/conversions?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch conversions");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Status-to-Status Conversions
        </h2>
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-12 bg-[#21262d] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-2">
          Status-to-Status Conversions
        </h2>
        <p className="text-[#f85149] text-sm">Failed to load conversions</p>
      </div>
    );
  }

  const conversions: Conversion[] = data?.conversions || [];
  const recordTypeChanges: RecordTypeChange[] = data?.recordTypeChanges || [];

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-sm font-semibold text-[#e6edf3]">
          Status-to-Status Conversions
        </h2>
        <p className="text-xs text-[#8b949e]">
          Counts use distinct jobs from JobNimbus activity history, so the same job does not get doubled up in one transition.
        </p>
      </div>

      {recordTypeChanges.length > 0 && (
        <div className="mb-5 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
              Record type movement
            </h3>
            <span className="text-xs text-[#8b949e]">Current rollups use current type</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recordTypeChanges.map((change) => (
              <div key={`${change.fromType}-${change.toType}`} className="rounded-md bg-[#161b22] p-3">
                <div className="text-sm font-semibold text-[#e6edf3]">
                  {change.fromType} → {change.toType}
                </div>
                <div className="text-xs text-[#8b949e]">
                  {change.changedJobs} distinct job{change.changedJobs === 1 ? "" : "s"} changed this period
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {conversions.map((conv, idx) => (
          <div key={idx} className="bg-[#21262d] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#e6edf3]">
                {conv.label}
              </span>
              <span className="text-sm font-bold text-[#58a6ff]">
                {conv.conversion_rate.toFixed(1)}%
              </span>
            </div>

            <div className="w-full bg-[#161b22] rounded-full h-2 mb-2 overflow-hidden">
              <div
                className="h-full bg-[#58a6ff] transition-all"
                style={{ width: `${Math.min(conv.conversion_rate, 100)}%` }}
              />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b949e]">
              <span>{conv.converted_jobs} converted</span>
              <span>{conv.from_status_jobs} reached/from status</span>
              {conv.avg_days !== null && <span>{conv.avg_days.toFixed(1)}d avg</span>}
            </div>
          </div>
        ))}
      </div>

      {conversions.length === 0 && (
        <p className="text-[#8b949e] text-sm">No conversion data available</p>
      )}
    </div>
  );
}
