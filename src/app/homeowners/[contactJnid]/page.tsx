"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Mail,
  MapPin,
  MessageSquareWarning,
  Phone,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TimelineEntry {
  id: string;
  source: string;
  channel: string;
  direction: string | null;
  line: string | null;
  occurredAt: string;
  preview: string;
  body: string | null;
  matchType: "direct" | "job" | "phone_fallback" | "email_fallback";
}

interface DetailResponse {
  contact: {
    contactJnid: string;
    name: string;
    address: string | null;
    phones: string[];
    emails: string[];
  };
  jobs: Array<{
    jobJnid: string;
    number: string | null;
    name: string;
    address: string | null;
    status: string | null;
    salesRep: string | null;
    claimNumber: string | null;
    carrier: string | null;
    dateOfLoss: string | null;
  }>;
  campaigns: Array<{
    id: string;
    engine: string;
    campaign: string;
    state: string;
    detail: string | null;
    updatedAt: string | null;
    matchType: string;
  }>;
  suppressions: Array<{
    id: string;
    channel: string;
    reason: string;
    source: string;
    createdAt: string;
    matchType: string;
  }>;
  exclusions: Array<{ job_number: string; reason: string }>;
  doNotText: boolean;
  identityWarnings: {
    ambiguousPhones: string[];
    ambiguousEmails: string[];
  };
  timeline: {
    events: TimelineEntry[];
    freshness: Record<string, string>;
    nextCursor: string | null;
  };
}

const centralFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCentral(value: string | null): string {
  return value ? `${centralFormatter.format(new Date(value))} CT` : "Unknown";
}

function FallbackBadge({ matchType }: { matchType: string }) {
  if (!matchType.endsWith("_fallback")) return null;
  return (
    <Badge
      variant="outline"
      className="border-yellow-500/40 text-[10px] text-yellow-300"
    >
      {matchType === "phone_fallback" ? "Phone match" : "Email match"}
    </Badge>
  );
}

export default function HomeownerDetailPage() {
  const { contactJnid } = useParams<{ contactJnid: string }>();
  const query = useInfiniteQuery<DetailResponse>({
    queryKey: ["homeowner", contactJnid],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "100" });
      if (pageParam) params.set("before", String(pageParam));
      const response = await fetch(
        `/api/homeowners/${encodeURIComponent(contactJnid)}?${params}`
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        console.error("[Homeowner Detail] API request failed", {
          status: response.status,
          message: payload?.error ?? "Homeowner could not be loaded",
        });
        throw new Error(
          payload?.error ?? `Homeowner could not be loaded (${response.status})`
        );
      }
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.timeline.nextCursor ?? undefined,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 bg-[#161b22]" />
        <Skeleton className="h-48 bg-[#161b22]" />
        <Skeleton className="h-96 bg-[#161b22]" />
      </div>
    );
  }

  if (query.isError || !query.data?.pages[0]) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-5 text-red-300">
        This homeowner could not be loaded.
      </div>
    );
  }

  const homeowner = query.data.pages[0];
  const timeline = query.data.pages.flatMap((page) => page.timeline.events);
  const ambiguousCount =
    homeowner.identityWarnings.ambiguousPhones.length +
    homeowner.identityWarnings.ambiguousEmails.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/homeowners"
        className="inline-flex items-center gap-2 text-sm text-[#8b949e] hover:text-[#58a6ff]"
      >
        <ArrowLeft className="h-4 w-4" />
        Homeowner search
      </Link>

      <Card className="border-[#30363d] bg-[#161b22]">
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-[#e6edf3]">
                  {homeowner.contact.name}
                </h1>
                {homeowner.doNotText && (
                  <Badge className="bg-red-500/15 text-red-300">
                    Do not text
                  </Badge>
                )}
              </div>
              {homeowner.contact.address && (
                <p className="mt-2 flex items-center gap-2 text-sm text-[#8b949e]">
                  <MapPin className="h-4 w-4" />
                  {homeowner.contact.address}
                </p>
              )}
            </div>
            <div className="space-y-2 text-sm text-[#8b949e]">
              {homeowner.contact.phones.map((phone) => (
                <div key={phone} className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {phone}
                </div>
              ))}
              {homeowner.contact.emails.map((email) => (
                <div key={email} className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {email}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {(homeowner.suppressions.length > 0 ||
        homeowner.exclusions.length > 0) && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-red-300">
              <MessageSquareWarning className="h-4 w-4" />
              Communication restrictions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {homeowner.suppressions.map((suppression) => (
              <div key={suppression.id} className="flex flex-wrap gap-2">
                <Badge className="bg-red-500/15 text-red-300">
                  {suppression.channel}
                </Badge>
                <span className="text-[#e6edf3]">{suppression.reason}</span>
                <span className="text-[#8b949e]">via {suppression.source}</span>
                <FallbackBadge matchType={suppression.matchType} />
              </div>
            ))}
            {homeowner.exclusions.map((exclusion) => (
              <div key={exclusion.job_number} className="text-[#e6edf3]">
                Job {exclusion.job_number}: {exclusion.reason}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {ambiguousCount > 0 && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          {ambiguousCount} shared phone/email identifier
          {ambiguousCount === 1 ? " was" : "s were"} excluded from fallback
          matching to prevent an ambiguous merge.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-[#e6edf3]">
              <BriefcaseBusiness className="h-4 w-4" />
              JobNimbus jobs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {homeowner.jobs.length === 0 && (
              <p className="text-sm text-[#8b949e]">No non-test jobs found.</p>
            )}
            {homeowner.jobs.map((job) => (
              <div
                key={job.jobJnid}
                className="rounded-md border border-[#30363d] bg-[#0d1117] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[#e6edf3]">{job.name}</p>
                    <p className="text-xs text-[#8b949e]">
                      {job.number ?? job.jobJnid}
                    </p>
                  </div>
                  {job.status && (
                    <Badge className="bg-[#58a6ff]/10 text-[#58a6ff]">
                      {job.status}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#8b949e]">
                  <span>Sales rep</span>
                  <span className="text-[#e6edf3]">
                    {job.salesRep ?? "Unassigned"}
                  </span>
                  {job.claimNumber && (
                    <>
                      <span>Claim #</span>
                      <span className="text-[#e6edf3]">{job.claimNumber}</span>
                    </>
                  )}
                  {job.carrier && (
                    <>
                      <span>Carrier</span>
                      <span className="text-[#e6edf3]">{job.carrier}</span>
                    </>
                  )}
                  {job.dateOfLoss && (
                    <>
                      <span>Date of loss</span>
                      <span className="text-[#e6edf3]">
                        {formatCentral(job.dateOfLoss)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-sm text-[#e6edf3]">
              Active campaigns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {homeowner.campaigns.length === 0 && (
              <p className="text-sm text-[#8b949e]">
                No active sequence, marketing automation, or matched Hatch rows.
              </p>
            )}
            {homeowner.campaigns.map((campaign) => (
              <div
                key={`${campaign.engine}:${campaign.id}`}
                className="rounded-md border border-[#30363d] bg-[#0d1117] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[#e6edf3]">
                    {campaign.campaign}
                  </p>
                  <Badge variant="outline" className="border-[#30363d] text-[#8b949e]">
                    {campaign.engine}
                  </Badge>
                  <FallbackBadge matchType={campaign.matchType} />
                </div>
                <p className="mt-1 text-xs text-[#58a6ff]">{campaign.state}</p>
                {campaign.detail && (
                  <p className="mt-1 text-xs text-[#8b949e]">{campaign.detail}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#30363d] bg-[#161b22]">
        <CardHeader>
          <CardTitle className="text-sm text-[#e6edf3]">
            Unified timeline
          </CardTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6e7681]">
            {Object.entries(homeowner.timeline.freshness).map(
              ([source, timestamp]) => (
                <span key={source}>
                  {source}: {formatCentral(timestamp)}
                </span>
              )
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {timeline.map((event) => (
              <details
                key={`${event.source}:${event.id}`}
                className="group rounded-md border border-[#30363d] bg-[#0d1117] p-3"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[#21262d] text-[#e6edf3]">
                      {event.channel}
                    </Badge>
                    {event.direction && (
                      <span className="text-xs capitalize text-[#8b949e]">
                        {event.direction}
                      </span>
                    )}
                    <FallbackBadge matchType={event.matchType} />
                    <span className="ml-auto text-xs text-[#6e7681]">
                      {formatCentral(event.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#e6edf3]">{event.preview}</p>
                  {event.line && (
                    <p className="mt-1 text-xs text-[#6e7681]">{event.line}</p>
                  )}
                </summary>
                {event.body && (
                  <div className="mt-3 whitespace-pre-wrap border-t border-[#21262d] pt-3 text-sm text-[#8b949e]">
                    {event.body}
                  </div>
                )}
              </details>
            ))}
          </div>
          {query.hasNextPage && (
            <Button
              variant="outline"
              className="mt-4 w-full border-[#30363d]"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${query.isFetchingNextPage ? "animate-spin" : ""}`}
              />
              Load older activity
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
