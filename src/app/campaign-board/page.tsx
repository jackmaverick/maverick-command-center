"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface BoardCard {
  id: string;
  state: string;
  contactJnid: string | null;
  homeowner_name: string;
  job_status: string | null;
  sales_rep: string | null;
  updated_at: string;
}

interface Campaign {
  id: string;
  name: string;
  engine: string;
  columns: Record<string, BoardCard[]>;
}

interface CampaignBoardData {
  campaigns: Campaign[];
  warnings: Array<{
    source: "sequence" | "marketing";
    message: string;
  }>;
}

const columns = [
  { key: "in_progress", label: "In Progress", color: "text-[#58a6ff]" },
  { key: "needs_human", label: "Needs human", color: "text-yellow-300" },
  { key: "paused", label: "Paused", color: "text-[#a371f7]" },
  { key: "discard", label: "Discard", color: "text-[#8b949e]" },
];

export default function CampaignBoardPage() {
  const { data, isLoading, isError, error } = useQuery<CampaignBoardData>({
    queryKey: ["campaign-board"],
    queryFn: async () => {
      const response = await fetch("/api/campaign-board");
      const payload = (await response.json().catch(() => null)) as
        | CampaignBoardData
        | { error?: string }
        | null;
      if (!response.ok) {
        const message =
          payload && "error" in payload && payload.error
            ? payload.error
            : "Campaign board request failed";
        console.error("[Campaign Board] API request failed", {
          status: response.status,
          message,
        });
        throw new Error(`${message} (${response.status})`);
      }
      return payload as CampaignBoardData;
    },
  });

  return (
    <div>
      <div className="mb-6">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[#58a6ff]">
          Read-only campaign operations
        </p>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Campaign board</h1>
        <p className="mt-1 text-sm text-[#8b949e]">
          Current sequence and marketing enrollment states. Cards link to the
          unified homeowner record when a JobNimbus contact is available.
        </p>
      </div>

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-80 bg-[#161b22]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          The campaign board could not be loaded
          {error instanceof Error ? `: ${error.message}` : "."}
        </div>
      )}

      {data?.warnings.map((warning) => (
        <div
          key={warning.source}
          className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200"
        >
          {warning.message}
        </div>
      ))}

      <div className="space-y-8">
        {data?.campaigns.map((campaign) => (
          <section key={campaign.id}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold text-[#e6edf3]">{campaign.name}</h2>
              <Badge variant="outline" className="border-[#30363d] text-[#8b949e]">
                {campaign.engine}
              </Badge>
            </div>
            <div className="grid gap-4 xl:grid-cols-4">
              {columns.map((column) => {
                const cards = campaign.columns[column.key] ?? [];
                return (
                  <Card
                    key={column.key}
                    className="border-[#30363d] bg-[#161b22]"
                  >
                    <CardHeader className="pb-3">
                      <CardTitle
                        className={`flex items-center justify-between text-xs uppercase tracking-wide ${column.color}`}
                      >
                        {column.label}
                        <span>{cards.length}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {cards.length === 0 && (
                        <p className="py-6 text-center text-xs text-[#6e7681]">
                          No enrollments
                        </p>
                      )}
                      {cards.map((card) => {
                        const content = (
                          <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3 transition-colors hover:border-[#58a6ff]">
                            <p className="font-medium text-[#e6edf3]">
                              {card.homeowner_name}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Badge className="bg-[#21262d] text-[#8b949e]">
                                {card.state}
                              </Badge>
                              {card.job_status && (
                                <Badge className="bg-[#58a6ff]/10 text-[#58a6ff]">
                                  {card.job_status}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-[#6e7681]">
                              {card.sales_rep ?? "Unassigned"}
                            </p>
                          </div>
                        );
                        return card.contactJnid ? (
                          <Link
                            key={card.id}
                            href={`/homeowners/${encodeURIComponent(card.contactJnid)}`}
                          >
                            {content}
                          </Link>
                        ) : (
                          <div key={card.id}>{content}</div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
