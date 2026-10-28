"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ConversationItem,
  WorkspaceKey,
} from "@/lib/inbox/types";

interface ThreadData {
  homeowner: {
    contactJnid: string;
    name: string;
    address: string | null;
    phones: string[];
    emails: string[];
  };
  jobs: Array<{
    jobJnid: string;
    name: string;
    status: string | null;
    address: string | null;
    salesRep: string | null;
  }>;
  campaigns: Array<{
    id: string;
    campaign: string;
    state: string;
    engine: string;
  }>;
  items: ConversationItem[];
  notes: ConversationItem[];
  primaryJob: {
    jobJnid: string;
    status: string | null;
    salesRep: string | null;
  } | null;
  warnings: Array<{ source: string; message: string }>;
}

const centralDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const centralTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  hour: "numeric",
  minute: "2-digit",
});

function dateKey(value: string): string {
  return centralDate.format(new Date(value));
}

function channelLabel(item: ConversationItem): string {
  if (item.type === "call") {
    const duration = item.durationSeconds
      ? ` · ${Math.max(1, Math.round(item.durationSeconds / 60))}m`
      : "";
    return `Call · ${item.direction}${duration}`;
  }
  if (item.type === "email") return `Gmail · ${item.line ?? "mailbox"}`;
  if (item.type === "text") return `Text · ${item.line ?? "OpenPhone"}`;
  if (item.type === "note") return "JobNimbus note";
  return item.channel;
}

function SystemLine({ item }: { item: ConversationItem }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] text-[#6e7681]">
      <div className="h-px flex-1 bg-[#30363d]" />
      <span className="max-w-[75%] text-center">
        {item.preview}
        {item.systemEvent?.actor ? ` by ${item.systemEvent.actor}` : ""}
        {item.systemEvent?.disposition
          ? ` · Disposition: ${item.systemEvent.disposition}`
          : ""}
      </span>
      <div className="h-px flex-1 bg-[#30363d]" />
    </div>
  );
}

export function ThreadPanel({
  contactJnid,
  workspace,
}: {
  contactJnid: string;
  workspace: WorkspaceKey;
}) {
  const { data, isLoading, isError } = useQuery<ThreadData>({
    queryKey: ["campaign-thread", contactJnid, workspace],
    queryFn: async () => {
      const response = await fetch(
        `/api/campaign-thread/${encodeURIComponent(contactJnid)}?workspace=${workspace}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("[Campaign Thread] API request failed", {
          status: response.status,
          message: payload?.error,
        });
        throw new Error(payload?.error ?? "Thread failed");
      }
      return payload;
    },
    refetchInterval: 45_000,
  });

  if (isLoading) {
    return (
      <div className="grid h-full flex-1 grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3 p-5">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-20 bg-[#21262d]" />
          ))}
        </div>
        <div className="border-l border-[#30363d] p-4">
          <Skeleton className="h-56 bg-[#21262d]" />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-red-300">
        This conversation could not be loaded.
      </div>
    );
  }

  return (
    <div className="grid h-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)_280px]">
      <section className="flex min-w-0 flex-col bg-[#0d1117]">
        <header className="border-b border-[#30363d] px-5 py-3">
          <h2 className="font-semibold text-[#e6edf3]">{data.homeowner.name}</h2>
          <p className="truncate text-xs text-[#8b949e]">
            {data.homeowner.address ?? "No address"}
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {data.warnings.map((warning) => (
            <div
              key={warning.source}
              className="mb-3 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-200"
            >
              {warning.message}
            </div>
          ))}
          {data.items.map((item, index) => {
            const currentDate = dateKey(item.occurredAt);
            const previousItem = data.items[index - 1];
            const showDate =
              !previousItem || dateKey(previousItem.occurredAt) !== currentDate;
            return (
              <div key={item.id}>
                {showDate && (
                  <div className="my-4 text-center text-[11px] font-medium text-[#6e7681]">
                    {currentDate}
                  </div>
                )}
                {item.type === "system" ? (
                  <SystemLine item={item} />
                ) : (
                  <div
                    className={`mb-3 flex ${
                      item.direction === "outbound"
                        ? "justify-end"
                        : item.direction === "inbound"
                          ? "justify-start"
                          : "justify-center"
                    }`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                        item.direction === "outbound"
                          ? "rounded-br-sm bg-[#1f6feb] text-white"
                          : item.direction === "inbound"
                            ? "rounded-bl-sm border border-[#30363d] bg-[#161b22] text-[#e6edf3]"
                            : "bg-[#21262d] text-[#c9d1d9]"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] opacity-75">
                        <span>{channelLabel(item)}</span>
                        {item.sender && <span>· {item.sender}</span>}
                        <span>{centralTime.format(new Date(item.occurredAt))}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">
                        {item.body ?? item.preview}
                      </p>
                      {item.deliveryStatus && (
                        <p className="mt-1 text-right text-[10px] opacity-60">
                          {item.deliveryStatus}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-[#30363d] bg-[#161b22] p-3">
          <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-3 text-sm text-[#6e7681]">
            Replies coming soon
          </div>
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto border-l border-[#30363d] bg-[#161b22] p-4">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
          Homeowner
        </h3>
        <div className="space-y-3 text-sm text-[#c9d1d9]">
          {data.homeowner.phones.map((phone) => (
            <div key={phone} className="flex gap-2">
              <Phone className="mt-0.5 h-4 w-4 text-[#8b949e]" />
              {phone}
            </div>
          ))}
          {data.homeowner.emails.map((email) => (
            <div key={email} className="flex min-w-0 gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#8b949e]" />
              <span className="break-all">{email}</span>
            </div>
          ))}
          {data.homeowner.address && (
            <div className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#8b949e]" />
              {data.homeowner.address}
            </div>
          )}
        </div>

        <div className="my-5 border-t border-[#30363d]" />
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
          JobNimbus
        </h3>
        {data.primaryJob ? (
          <div className="space-y-2 text-sm">
            <Badge className="bg-[#58a6ff]/10 text-[#58a6ff]">
              {data.primaryJob.status ?? "No status"}
            </Badge>
            <p className="text-xs text-[#8b949e]">
              {data.primaryJob.salesRep ?? "Unassigned"}
            </p>
            <a
              href={`https://app.jobnimbus.com/jobs/${encodeURIComponent(data.primaryJob.jobJnid)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#58a6ff]"
            >
              Open job <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <p className="text-xs text-[#8b949e]">No linked active job.</p>
        )}

        <div className="my-5 border-t border-[#30363d]" />
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
          Workspace & campaigns
        </h3>
        <Badge variant="outline" className="mb-2 border-[#30363d] capitalize">
          {workspace.replaceAll("_", " ")}
        </Badge>
        <div className="space-y-1">
          {data.campaigns.map((campaign) => (
            <div key={`${campaign.engine}:${campaign.id}`} className="text-xs text-[#c9d1d9]">
              {campaign.campaign} · {campaign.state}
            </div>
          ))}
        </div>

        {data.jobs.length > 1 && (
          <>
            <div className="my-5 border-t border-[#30363d]" />
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
              Earlier jobs
            </h3>
            {data.jobs.slice(1).map((job) => (
              <Link
                key={job.jobJnid}
                href={`/homeowners/${data.homeowner.contactJnid}`}
                className="mb-2 block text-xs text-[#58a6ff]"
              >
                {job.name} · {job.status ?? "No status"}
              </Link>
            ))}
          </>
        )}

        {data.notes.length > 0 && (
          <>
            <div className="my-5 border-t border-[#30363d]" />
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
              <StickyNote className="h-3.5 w-3.5" /> Notes
            </h3>
            {data.notes.slice(-5).map((note) => (
              <div
                key={note.id}
                className="mb-2 rounded border border-[#30363d] bg-[#0d1117] p-2 text-xs text-[#c9d1d9]"
              >
                {note.preview}
              </div>
            ))}
          </>
        )}

        <Link
          href={`/homeowners/${data.homeowner.contactJnid}`}
          className="mt-5 inline-flex items-center gap-2 text-xs text-[#58a6ff]"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Full homeowner view
        </Link>
      </aside>
    </div>
  );
}
