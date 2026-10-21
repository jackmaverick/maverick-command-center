"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiErrorState } from "@/components/api-error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type StaleEstimateData = {
  summary: {
    jobCount: number;
    totalValue: number;
    stale90Count: number;
    timeZone: string;
  };
  jobs: Array<{
    jobJnid: string;
    jobNumber: string | null;
    jobName: string | null;
    salesRepName: string;
    repSource: string;
    recordType: string | null;
    statusChangedAt: string;
    ageDays: number;
    stale90: boolean;
    estimateValue: number;
    jobUrl: string;
  }>;
};

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function StaleEstimatesPage() {
  const { data, isLoading, isError, refetch } = useQuery<StaleEstimateData>({
    queryKey: ["stale-estimates"],
    queryFn: async () => {
      const response = await fetch("/api/metrics/stale-estimates", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load stale estimates");
      return response.json();
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#e6edf3]">Stale Estimates</h1>
        <p className="mt-1 text-sm text-[#8b949e]">
          Current Estimate Sent jobs unchanged for at least 14 CT calendar days.
        </p>
      </div>

      {isError && (
        <ApiErrorState
          title="Stale estimates could not be loaded"
          onRetry={() => void refetch()}
        />
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          [1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 bg-[#161b22]" />
          ))
        ) : (
          <>
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-[#8b949e]">
                  14+ days
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-[#e6edf3]">
                {data?.summary.jobCount ?? 0}
              </CardContent>
            </Card>
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-[#8b949e]">
                  Open estimate value
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-[#d29922]">
                {money(data?.summary.totalValue ?? 0)}
              </CardContent>
            </Card>
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-[#8b949e]">
                  90+ days
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold text-[#f85149]">
                {data?.summary.stale90Count ?? 0}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {!isLoading && data && (
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardContent className="overflow-x-auto pt-6">
            <table className="w-full min-w-[850px] text-sm">
              <thead>
                <tr className="border-b border-[#30363d] text-left text-xs text-[#8b949e]">
                  <th className="pb-3 font-medium">Job</th>
                  <th className="pb-3 font-medium">Record type</th>
                  <th className="pb-3 font-medium">Rep</th>
                  <th className="pb-3 text-right font-medium">Age</th>
                  <th className="pb-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr
                    key={job.jobJnid}
                    className="border-b border-[#21262d]"
                  >
                    <td className="py-3">
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#58a6ff] hover:underline"
                      >
                        {job.jobNumber || job.jobName || job.jobJnid}
                      </a>
                    </td>
                    <td className="py-3 text-[#8b949e]">
                      {job.recordType || "Unknown"}
                    </td>
                    <td className="py-3 text-[#e6edf3]">
                      {job.salesRepName}
                      {job.repSource !== "sales_rep" && (
                        <span className="ml-2 text-[10px] uppercase text-[#d29922]">
                          {job.repSource.replace("_", " ")}
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-3 text-right font-mono ${
                        job.stale90 ? "text-[#f85149]" : "text-[#d29922]"
                      }`}
                    >
                      {job.ageDays}d
                    </td>
                    <td className="py-3 text-right font-mono text-[#e6edf3]">
                      {money(job.estimateValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
