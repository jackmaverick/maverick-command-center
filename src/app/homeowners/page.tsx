"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SearchResult {
  contactJnid: string;
  name: string;
  address: string | null;
  status: string | null;
  jobCount: number;
}

export default function HomeownersPage() {
  const [search, setSearch] = useState("");
  const query = search.trim();
  const { data, isFetching, isError } = useQuery<{
    results: SearchResult[];
  }>({
    queryKey: ["homeowners", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const response = await fetch(`/api/homeowners?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[#58a6ff]">
          Unified homeowner view
        </p>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Homeowners</h1>
        <p className="mt-1 text-sm text-[#8b949e]">
          Search JobNimbus contacts by homeowner name or street address.
        </p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-[#6e7681]" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or street address"
          className="border-[#30363d] bg-[#161b22] pl-10 text-[#e6edf3]"
          autoFocus
        />
      </div>

      {isFetching && (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24 bg-[#161b22]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Search could not be loaded. Please try again.
        </div>
      )}

      {!isFetching && query.length >= 2 && data?.results.length === 0 && (
        <div className="rounded-md border border-[#30363d] bg-[#161b22] p-8 text-center text-sm text-[#8b949e]">
          No non-test contacts matched that search.
        </div>
      )}

      <div className="space-y-3">
        {data?.results.map((result) => (
          <Link
            key={result.contactJnid}
            href={`/homeowners/${result.contactJnid}`}
            className="block"
          >
            <Card className="border-[#30363d] bg-[#161b22] transition-colors hover:border-[#58a6ff]">
              <CardContent className="flex items-start gap-4 p-4">
                <div className="rounded-full bg-[#58a6ff]/10 p-2">
                  <UserRound className="h-5 w-5 text-[#58a6ff]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-[#e6edf3]">
                      {result.name}
                    </h2>
                    <span className="text-xs text-[#8b949e]">
                      {result.jobCount} {result.jobCount === 1 ? "job" : "jobs"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#8b949e]">
                    {result.address ?? "No address"}
                  </p>
                  {result.status && (
                    <span className="mt-2 inline-flex rounded-full bg-[#21262d] px-2 py-1 text-xs text-[#8b949e]">
                      {result.status}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
