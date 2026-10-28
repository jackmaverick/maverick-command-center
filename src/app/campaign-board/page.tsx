"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Columns3,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ThreadPanel } from "@/components/inbox/thread-panel";
import type {
  InboxResponse,
  InboxRow,
  WorkspaceKey,
} from "@/lib/inbox/types";

type ViewMode = "inbox" | "board";
type OpenFilter = "open" | "done" | "any";

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(value: string | null, now: number): string {
  if (!value) return "";
  const minutes = Math.round(
    (new Date(value).getTime() - now) / 60_000
  );
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
  return relativeTime.format(Math.round(hours / 24), "day");
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ChannelIcon({ row }: { row: InboxRow }) {
  if (row.channel === "Call") {
    return row.direction === "outbound" ? (
      <ArrowUpRight className="h-3.5 w-3.5" />
    ) : (
      <ArrowDownLeft className="h-3.5 w-3.5" />
    );
  }
  if (row.channel === "Email") return <Mail className="h-3.5 w-3.5" />;
  if (row.channel === "SMS") return <MessageSquare className="h-3.5 w-3.5" />;
  return <Phone className="h-3.5 w-3.5" />;
}

function ConversationRow({
  row,
  selected,
  onClick,
  now,
}: {
  row: InboxRow;
  selected: boolean;
  onClick: () => void;
  now: number;
}) {
  const outbound =
    row.direction === "outgoing" || row.direction === "outbound";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full border-b border-[#21262d] p-3 text-left transition-colors ${
        selected ? "bg-[#1f6feb]/10" : "hover:bg-[#161b22]"
      }`}
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#21262d] text-xs font-semibold text-[#c9d1d9]">
          {initials(row.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[#e6edf3]">
              {row.name}
            </span>
            {row.unread && <span className="h-2 w-2 rounded-full bg-[#58a6ff]" />}
            <span className="ml-auto shrink-0 text-[10px] text-[#6e7681]">
              {timeAgo(row.lastAt, now)}
            </span>
          </div>
          <p className="truncate text-xs text-[#8b949e]">
            {row.street ?? "No street address"}
          </p>
          <div className="mt-1 flex items-center gap-1 text-xs text-[#8b949e]">
            <ChannelIcon row={row} />
            <span className="truncate">
              {outbound ? `${row.sender ?? "You"}: ` : ""}
              {row.preview}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {row.campaign && (
              <Badge className="bg-[#a371f7]/10 text-[10px] text-[#d2a8ff]">
                {row.campaign}
              </Badge>
            )}
            {row.status && (
              <Badge className="bg-[#58a6ff]/10 text-[10px] text-[#58a6ff]">
                {row.status}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function CampaignBoardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") === "board" ? "board" : "inbox") as ViewMode;
  const workspace = (searchParams.get("workspace") ?? "insurance") as WorkspaceKey;
  const selectedContact = searchParams.get("thread");
  const [openFilter, setOpenFilter] = useState<OpenFilter>("open");
  const [unread, setUnread] = useState(false);
  const [unresponded, setUnresponded] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [now] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const saved = localStorage.getItem(`campaign-inbox:${workspace}`);
    if (!saved) return;
    try {
      const filters = JSON.parse(saved) as {
        open?: OpenFilter;
        unread?: boolean;
        unresponded?: boolean;
      };
      setOpenFilter(filters.open ?? "open");
      setUnread(Boolean(filters.unread));
      setUnresponded(Boolean(filters.unresponded));
    } catch {
      // Ignore malformed local preferences.
    }
  }, [workspace]);

  useEffect(() => {
    localStorage.setItem(
      `campaign-inbox:${workspace}`,
      JSON.stringify({ open: openFilter, unread, unresponded })
    );
  }, [openFilter, unread, unresponded, workspace]);

  const effectiveOpen = view === "board" ? "any" : openFilter;
  const { data, isLoading, isError } = useQuery<InboxResponse>({
    queryKey: [
      "campaign-inbox",
      workspace,
      view,
      effectiveOpen,
      unread,
      unresponded,
      deferredSearch,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        workspace,
        view,
        open: effectiveOpen,
        unread: String(unread),
        unresponded: String(unresponded),
        search: deferredSearch,
        page: String(view === "board" ? 0 : page),
      });
      const response = await fetch(`/api/campaign-inbox?${params}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("[Campaign Inbox] API request failed", {
          status: response.status,
          message: payload?.error,
        });
        throw new Error(payload?.error ?? "Inbox failed");
      }
      return payload;
    },
    refetchInterval: 45_000,
  });

  const updateUrl = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  useEffect(() => {
    if (view === "inbox" && !selectedContact && data?.rows[0]) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("thread", data.rows[0].contactJnid);
      router.replace(`${pathname}?${params}`, { scroll: false });
    }
  }, [data?.rows, pathname, router, searchParams, selectedContact, view]);

  const boardColumns = useMemo(
    () =>
      data?.columns
        .map((column) => ({
          ...column,
          rows: data.rows
            .filter((row) => row.status === column.status)
            .sort(
              (left, right) =>
                new Date(right.lastAt ?? 0).getTime() -
                new Date(left.lastAt ?? 0).getTime()
            ),
        }))
        .filter((column) => column.count > 0 || column.rows.length > 0) ?? [],
    [data]
  );

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] min-h-[680px] flex-col overflow-hidden bg-[#0d1117] lg:-m-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-[#e6edf3]">Homeowner Inbox</h1>
          <p className="text-xs text-[#8b949e]">View only · replies coming soon</p>
        </div>
        <div className="ml-auto flex rounded-md border border-[#30363d] bg-[#0d1117] p-0.5">
          <button
            type="button"
            onClick={() => updateUrl({ view: "inbox", thread: selectedContact })}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs ${
              view === "inbox" ? "bg-[#21262d] text-white" : "text-[#8b949e]"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" /> Inbox
          </button>
          <button
            type="button"
            disabled={workspace === "general"}
            onClick={() => updateUrl({ view: "board", thread: null })}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs disabled:opacity-40 ${
              view === "board" ? "bg-[#21262d] text-white" : "text-[#8b949e]"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" /> Board
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-44 shrink-0 border-r border-[#30363d] bg-[#161b22] p-2">
          <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#6e7681]">
            Workspaces
          </p>
          {(data?.workspaces ?? []).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                updateUrl({
                  workspace: item.key,
                  view: item.key === "general" ? "inbox" : view,
                  thread: null,
                })
              }
              className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${
                workspace === item.key
                  ? "bg-[#1f6feb]/15 text-[#58a6ff]"
                  : "text-[#c9d1d9] hover:bg-[#21262d]"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span
                title="Needs attention / workspace count"
                className="rounded-full bg-[#30363d] px-1.5 py-0.5 text-[10px] text-[#c9d1d9]"
              >
                {item.attentionCount || item.count}
              </span>
            </button>
          ))}
        </aside>

        {view === "inbox" ? (
          <>
            <section className="flex w-[360px] shrink-0 flex-col border-r border-[#30363d]">
              <div className="space-y-2 border-b border-[#30363d] p-3">
                <div className="flex flex-wrap gap-1">
                  {(["open", "done", "any"] as OpenFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setOpenFilter(filter)}
                      className={`rounded-full px-2.5 py-1 text-[11px] capitalize ${
                        openFilter === filter
                          ? "bg-[#1f6feb] text-white"
                          : "bg-[#21262d] text-[#8b949e]"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setUnread((value) => !value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      unread ? "bg-[#1f6feb] text-white" : "bg-[#21262d] text-[#8b949e]"
                    }`}
                  >
                    Unread
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnresponded((value) => !value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      unresponded ? "bg-[#1f6feb] text-white" : "bg-[#21262d] text-[#8b949e]"
                    }`}
                  >
                    Unresponded
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6e7681]" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search homeowners"
                    className="h-9 border-[#30363d] bg-[#0d1117] pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {isLoading &&
                  [1, 2, 3, 4, 5].map((item) => (
                    <Skeleton key={item} className="m-3 h-20 bg-[#21262d]" />
                  ))}
                {isError && (
                  <p className="p-4 text-sm text-red-300">Inbox could not be loaded.</p>
                )}
                {data?.warnings.map((warning) => (
                  <p key={warning.source} className="p-3 text-xs text-yellow-200">
                    {warning.message}
                  </p>
                ))}
                {data?.rows.map((row) => (
                  <ConversationRow
                    key={`${row.contactJnid}:${row.jobJnid ?? ""}`}
                    row={row}
                    selected={selectedContact === row.contactJnid}
                    onClick={() => updateUrl({ thread: row.contactJnid })}
                    now={now}
                  />
                ))}
                {data && (
                  <div className="flex items-center justify-between border-t border-[#30363d] p-2 text-[11px] text-[#8b949e]">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((value) => Math.max(0, value - 1))}
                      className="rounded px-2 py-1 disabled:opacity-30"
                    >
                      Newer
                    </button>
                    <span>Page {page + 1}</span>
                    <button
                      type="button"
                      disabled={!data.hasMore}
                      onClick={() => setPage((value) => value + 1)}
                      className="rounded px-2 py-1 disabled:opacity-30"
                    >
                      Older
                    </button>
                  </div>
                )}
              </div>
            </section>
            {selectedContact ? (
              <ThreadPanel contactJnid={selectedContact} workspace={workspace} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[#6e7681]">
                Select a conversation
              </div>
            )}
          </>
        ) : (
          <section className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
            <div className="flex h-full min-w-max gap-3">
              {boardColumns.map((column, index) => (
                <div
                  key={column.status}
                  className="flex h-full w-72 flex-col rounded-lg border border-[#30363d] bg-[#161b22]"
                >
                  <div className="flex items-center gap-2 border-b border-[#30363d] p-3">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: `hsl(${(index * 37 + 205) % 360} 70% 58%)`,
                      }}
                    />
                    <span className="max-w-52 truncate text-xs font-semibold text-[#e6edf3]">
                      {column.status}
                    </span>
                    <Badge className="ml-auto bg-[#21262d] text-[#8b949e]">
                      {column.rows.length}
                    </Badge>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {column.rows.map((row) => (
                      <button
                        key={`${row.contactJnid}:${row.jobJnid ?? ""}`}
                        type="button"
                        onClick={() => updateUrl({ thread: row.contactJnid })}
                        className="w-full rounded-md border border-[#30363d] bg-[#0d1117] p-3 text-left hover:border-[#58a6ff]"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#e6edf3]">
                              {row.name}
                            </p>
                            <p className="truncate text-xs text-[#8b949e]">
                              {row.street ?? "No street"}
                            </p>
                          </div>
                          {row.unread && (
                            <span className="mt-1 h-2 w-2 rounded-full bg-[#58a6ff]" />
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-[11px] text-[#8b949e]">
                          <ChannelIcon row={row} />
                          <span>{timeAgo(row.lastAt, now)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-[#c9d1d9]">
                          {row.preview}
                        </p>
                        <p className="mt-2 truncate text-[10px] text-[#6e7681]">
                          {row.salesRep ?? "Unassigned"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <Sheet
        open={view === "board" && Boolean(selectedContact)}
        onOpenChange={(open) => {
          if (!open) updateUrl({ thread: null });
        }}
      >
        <SheetContent
          side="right"
          className="w-[72vw] max-w-none gap-0 border-[#30363d] bg-[#0d1117] p-0 sm:max-w-none"
        >
          <SheetTitle className="sr-only">Homeowner conversation</SheetTitle>
          <SheetDescription className="sr-only">
            Read-only homeowner conversation and job context
          </SheetDescription>
          {selectedContact && (
            <ThreadPanel contactJnid={selectedContact} workspace={workspace} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
