"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ExternalLink,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cleanDisplayText } from "@/lib/display-text";
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
  nextCursor: string | null;
}

interface ReplyContext {
  capabilities: Record<
    "text" | "email" | "note",
    {
      enabled: boolean;
      allowed: boolean;
      canCompose: boolean;
      sendNow: boolean;
      queueFor: string | null;
      reason: string | null;
    }
  >;
  text: {
    selectedLine: {
      phoneNumberId: string;
      phoneNumber: string;
      name: string | null;
    } | null;
    recipient: string | null;
    lines: Array<{
      phoneNumberId: string;
      phoneNumber: string;
      name: string | null;
    }>;
    optedOut: boolean;
    blockedReason: string | null;
  };
  email: {
    reply: {
      mailbox: string | null;
      subject: string;
      blockedReason: string | null;
    } | null;
    newEmail: { defaultFrom: string; fromOptions: string[]; to: string[] };
  };
  outbound: Array<{
    id: string;
    channel: "text" | "email" | "note";
    status: string;
    body: string;
    scheduledFor: string | null;
    failureMessage: string | null;
  }>;
  drafts: Array<{
    channel: "text" | "email" | "note";
    body: string;
  }>;
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
  if (item.channel === "JobNimbus") return "JobNimbus";
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

function ChannelLabel({ item }: { item: ConversationItem }) {
  const label = channelLabel(item);
  const icon =
    item.channel === "JobNimbus" || item.type === "note" ? (
      <StickyNote className="h-3 w-3" />
    ) : item.type === "call" ? (
      <Phone className="h-3 w-3" />
    ) : item.type === "email" ? (
      <Mail className="h-3 w-3" />
    ) : (
      <MessageSquare className="h-3 w-3" />
    );
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      {label}
    </span>
  );
}

function SystemLine({ item }: { item: ConversationItem }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] text-[#6e7681]">
      <div className="h-px flex-1 bg-[#30363d]" />
      <span className="max-w-[75%] text-center">
        {cleanDisplayText(item.preview)}
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
  allowSystemEvents = false,
}: {
  contactJnid: string;
  workspace: WorkspaceKey;
  allowSystemEvents?: boolean;
}) {
  const [showSystemEvents, setShowSystemEvents] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<
    "text" | "email" | "note" | null
  >(null);
  const [body, setBody] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<"reply" | "new">("reply");
  const [emailFrom, setEmailFrom] = useState("info@maverickexteriorskc.com");
  const queryClient = useQueryClient();
  const {
    data: queryData,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<ThreadData>({
    queryKey: ["campaign-thread", contactJnid, workspace],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ workspace });
      if (pageParam) params.set("before", String(pageParam));
      const response = await fetch(
        `/api/campaign-thread/${encodeURIComponent(contactJnid)}?${params}`
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
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: 45_000,
  });
  const data = queryData?.pages[0];
  const items = [
    ...new Map(
      (queryData?.pages.flatMap((page) => page.items) ?? []).map((item) => [
        item.id,
        item,
      ])
    ).values(),
  ].sort(
    (left, right) =>
      new Date(left.occurredAt).getTime() -
      new Date(right.occurredAt).getTime()
  );
  const visibleItems = items.filter(
    (item) => item.type !== "system" || (allowSystemEvents && showSystemEvents)
  );
  const latestTextLine = [...items]
    .reverse()
    .find((item) => item.type === "text" && item.channel !== "JobNimbus")?.line;
  const latestEmailInbox = [...items]
    .reverse()
    .find((item) => item.type === "email" && item.channel !== "JobNimbus")?.line;
  const defaultChannel =
    [...items].reverse().find((item) =>
      ["text", "email"].includes(item.type)
    )?.type === "email"
      ? "email"
      : "text";
  const channel = selectedChannel ?? defaultChannel;
  const jobJnid = data?.primaryJob?.jobJnid ?? null;
  const { data: replyContext } = useQuery<ReplyContext>({
    queryKey: ["reply-context", contactJnid, jobJnid],
    enabled: Boolean(data),
    queryFn: async () => {
      const params = new URLSearchParams({ contactJnid });
      if (jobJnid) params.set("jobJnid", jobJnid);
      const response = await fetch(`/api/replies/context?${params}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Reply context failed");
      return payload;
    },
    refetchInterval: 45_000,
  });
  const sendReply = useMutation({
    mutationFn: async () => {
      const selectedLine =
        replyContext?.text.lines.find(
          (line) =>
            line.phoneNumberId ===
            (selectedLineId ?? replyContext.text.selectedLine?.phoneNumberId)
        ) ?? null;
      const response = await fetch("/api/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          workspace,
          contactJnid,
          jobJnid,
          channel,
          messageMode: channel === "email" ? emailMode : "reply",
          body,
          fromAddress:
            channel === "text"
              ? selectedLine?.phoneNumber
              : channel === "email" && emailMode === "new"
                ? emailFrom
                : null,
          toAddresses:
            channel === "email" && emailMode === "new"
              ? replyContext?.email.newEmail.to ?? []
              : undefined,
          providerContext:
            channel === "text" && selectedLine
              ? { phoneNumberId: selectedLine.phoneNumberId }
              : {},
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Reply failed");
      return payload;
    },
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({
        queryKey: ["reply-context", contactJnid],
      });
      void queryClient.invalidateQueries({
        queryKey: ["campaign-thread", contactJnid],
      });
    },
  });
  const capability = replyContext?.capabilities[channel];
  const channelBlockedReason =
    channel === "text"
      ? replyContext?.text.blockedReason
      : channel === "email" && emailMode === "reply"
        ? replyContext?.email.reply?.blockedReason
        : null;
  const canSend = Boolean(
    capability?.canCompose &&
      body.trim() &&
      !channelBlockedReason &&
      !sendReply.isPending
  );
  const sendLabel =
    channel !== "note" && capability && !capability.sendNow
      ? "Queue for 8am"
      : "Send";

  useEffect(() => {
    if (!replyContext?.capabilities[channel].canCompose) return;
    const timer = window.setTimeout(() => {
      if (!body.trim()) {
        void fetch(
          `/api/replies/drafts?contactJnid=${encodeURIComponent(contactJnid)}&channel=${channel}`,
          { method: "DELETE" }
        );
        return;
      }
      void fetch("/api/replies/drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `draft:${workspace}:${contactJnid}:${channel}`,
          workspace,
          contactJnid,
          jobJnid,
          channel,
          messageMode: channel === "email" ? emailMode : "reply",
          body,
          fromAddress: channel === "email" ? emailFrom : null,
        }),
      });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [
    body,
    channel,
    contactJnid,
    emailFrom,
    emailMode,
    jobJnid,
    replyContext,
    workspace,
  ]);

  if (isLoading) {
    return (
      <div className="grid h-full min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3 p-5">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-20 bg-[#21262d]" />
          ))}
        </div>
        <div className="hidden border-l border-[#30363d] p-4 xl:block">
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
    <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#0d1117]">
        <header className="shrink-0 border-b border-[#30363d] px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-[#e6edf3]">{data.homeowner.name}</h2>
              <p className="truncate text-xs text-[#8b949e]">
                {data.homeowner.address ?? "No address"}
              </p>
            </div>
            {allowSystemEvents && (
              <button
                type="button"
                onClick={() => setShowSystemEvents((value) => !value)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${
                  showSystemEvents
                    ? "bg-[#1f6feb] text-white"
                    : "bg-[#21262d] text-[#8b949e]"
                }`}
              >
                System events
              </button>
            )}
          </div>
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
          {hasNextPage && (
            <div className="mb-4 text-center">
              <button
                type="button"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
                className="rounded-full border border-[#30363d] px-3 py-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-50"
              >
                {isFetchingNextPage ? "Loading…" : "Load earlier"}
              </button>
            </div>
          )}
          {visibleItems.map((item, index) => {
            const currentDate = dateKey(item.occurredAt);
            const previousItem = visibleItems[index - 1];
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
                        <ChannelLabel item={item} />
                        {item.sender && <span>· {item.sender}</span>}
                        <span>{centralTime.format(new Date(item.occurredAt))}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">
                        {cleanDisplayText(item.body ?? item.preview)}
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
        <div className="shrink-0 border-t border-[#30363d] bg-[#161b22] p-3">
          {replyContext?.outbound.slice(0, 3).map((outbound) => (
            <div
              key={outbound.id}
              className="mb-2 flex items-center gap-2 rounded-md bg-[#0d1117] px-2.5 py-1.5 text-[10px] text-[#8b949e]"
            >
              <span className="capitalize">{outbound.channel}</span>
              <span>·</span>
              <span className="capitalize">{outbound.status}</span>
              {outbound.scheduledFor && (
                <span>· queued for {centralTime.format(new Date(outbound.scheduledFor))}</span>
              )}
              <span className="min-w-0 flex-1 truncate">{outbound.body}</span>
              {outbound.status === "queued" && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/replies/${outbound.id}`, {
                      method: "DELETE",
                    });
                    void queryClient.invalidateQueries({
                      queryKey: ["reply-context", contactJnid],
                    });
                  }}
                  className="text-red-300"
                >
                  Cancel
                </button>
              )}
              {outbound.status === "failed" && (
                <button
                  type="button"
                  disabled={!capability?.canCompose}
                  onClick={async () => {
                    await fetch(`/api/replies/${outbound.id}`, {
                      method: "POST",
                    });
                    void queryClient.invalidateQueries({
                      queryKey: ["reply-context", contactJnid],
                    });
                  }}
                  className="text-[#58a6ff] disabled:opacity-40"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
          <div className="mb-2 flex flex-wrap gap-1">
            {(["text", "email", "note"] as const).map((option) => (
              <button
                key={option}
                type="button"
                disabled={!replyContext?.capabilities[option].canCompose}
                onClick={() => {
                  setSelectedChannel(option);
                  setBody(
                    replyContext?.drafts.find(
                      (draft) => draft.channel === option
                    )?.body ?? ""
                  );
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] capitalize ${
                  channel === option
                    ? "bg-[#1f6feb] text-white"
                    : "bg-[#21262d] text-[#8b949e]"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {option === "note" ? "Internal note" : option}
              </button>
            ))}
          </div>
          {channel === "text" &&
            replyContext &&
            !replyContext.text.selectedLine && (
              <select
                value={selectedLineId ?? ""}
                onChange={(event) => setSelectedLineId(event.target.value)}
                disabled={!capability?.canCompose}
                className="mb-2 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-2 text-xs text-[#c9d1d9]"
              >
                <option value="">Select an OpenPhone line</option>
                {replyContext.text.lines.map((line) => (
                  <option key={line.phoneNumberId} value={line.phoneNumberId}>
                    {line.name ?? "OpenPhone"} · {line.phoneNumber}
                  </option>
                ))}
              </select>
            )}
          {channel === "email" && replyContext && (
            <div className="mb-2 flex gap-2">
              <select
                value={emailMode}
                onChange={(event) =>
                  setEmailMode(event.target.value as "reply" | "new")
                }
                disabled={!capability?.canCompose}
                className="rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-2 text-xs text-[#c9d1d9]"
              >
                <option value="reply">Reply in thread</option>
                <option value="new">New email</option>
              </select>
              {emailMode === "new" && (
                <select
                  value={emailFrom}
                  onChange={(event) => setEmailFrom(event.target.value)}
                  disabled={!capability?.canCompose}
                  className="min-w-0 flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-2 text-xs text-[#c9d1d9]"
                >
                  {replyContext.email.newEmail.fromOptions.map((mailbox) => (
                    <option key={mailbox} value={mailbox}>
                      From {mailbox}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={!capability?.canCompose}
              placeholder={
                capability?.reason ??
                channelBlockedReason ??
                "Write a reply…"
              }
              rows={2}
              className="min-h-12 max-h-32 flex-1 resize-none overflow-y-auto rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] [field-sizing:content] placeholder:text-[#6e7681] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              disabled={!canSend}
              onClick={() => sendReply.mutate()}
              aria-label="Send reply"
              title={sendLabel}
              className="rounded-md bg-[#1f6feb] px-3 text-white disabled:bg-[#21262d] disabled:text-[#6e7681]"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1.5 text-[10px] text-[#6e7681]">
            {!replyContext?.capabilities[channel].enabled
              ? "Replies are disabled by REPLIES_ENABLED."
              : channelBlockedReason ??
                (sendLabel === "Queue for 8am"
                  ? "Outside 8am–7pm CT. This reply will be queued."
                  : `${sendLabel} via ${
                      channel === "text"
                        ? latestTextLine ?? "selected OpenPhone line"
                        : channel === "email"
                          ? latestEmailInbox ?? emailFrom
                          : "JobNimbus"
                    }`)}
          </div>
        </div>
      </section>

      <aside className="hidden h-full min-h-0 overflow-y-auto border-l border-[#30363d] bg-[#161b22] p-4 xl:block">
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
                {cleanDisplayText(note.preview)}
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
