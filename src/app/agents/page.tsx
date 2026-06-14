"use client";

import { useQuery } from "@tanstack/react-query";
import { AGENT_STATUS_COLORS } from "@/lib/constants";

type AgentStatus = "idle" | "active" | "sleeping" | "error";
type ConnectionStatus = "connected" | "partial" | "disconnected" | "unknown";

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  lastHeartbeat: string;
  tasksProcessed: number;
  tasksToday: number;
  uptime: string;
}

interface MailboxConnection {
  account: string;
  status: ConnectionStatus;
  access: string;
  evidence: string;
}

interface IntegrationConnection {
  id: string;
  name: string;
  status: ConnectionStatus;
  detail: string;
  evidence?: string;
}

interface AgentsResponse {
  agents: Agent[];
  gmail: {
    checkedAt: string | null;
    finding: string | null;
    summary: {
      totalMailboxes: number;
      connectedMailboxes: number;
      disconnectedMailboxes: number;
      unknownMailboxes: number;
      integrationsConnected: number;
      integrationsPartial: number;
      integrationsDisconnected: number;
      integrationsUnknown: number;
    };
    mailboxes: MailboxConnection[];
    integrations: IntegrationConnection[];
    notes: string[];
  };
  summary: {
    totalAgents: number;
    activeAgents: number;
    idleAgents: number;
    sleepingAgents: number;
    errorAgents: number;
    totalTasksToday: number;
    averageUptime: string;
  };
}

const CONNECTION_STYLES: Record<
  ConnectionStatus,
  { label: string; dot: string; text: string; border: string; bg: string }
> = {
  connected: {
    label: "Connected",
    dot: "bg-[#3fb950]",
    text: "text-[#3fb950]",
    border: "border-[#238636]",
    bg: "bg-[#0f2d1c]",
  },
  partial: {
    label: "Partial",
    dot: "bg-[#d29922]",
    text: "text-[#d29922]",
    border: "border-[#9e6a03]",
    bg: "bg-[#2d220f]",
  },
  disconnected: {
    label: "Disconnected",
    dot: "bg-[#f85149]",
    text: "text-[#f85149]",
    border: "border-[#da3633]",
    bg: "bg-[#2d1515]",
  },
  unknown: {
    label: "Unknown",
    dot: "bg-[#8b949e]",
    text: "text-[#8b949e]",
    border: "border-[#30363d]",
    bg: "bg-[#21262d]",
  },
};

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return "Unknown";
  const now = new Date();
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (Number.isNaN(diffMs)) return "Unknown";
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const style = CONNECTION_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg} ${style.border} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function MiniStat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass =
    tone === "good"
      ? "text-[#3fb950]"
      : tone === "warn"
        ? "text-[#d29922]"
        : tone === "bad"
          ? "text-[#f85149]"
          : "text-[#e6edf3]";

  return (
    <div className="bg-[#21262d] rounded-lg p-4">
      <p className="text-xs text-[#8b949e] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function AgentsPage() {
  const { data, isLoading, error } = useQuery<AgentsResponse>({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">AI Agents</h1>
        <p className="text-[#8b949e] mb-8">Loading agent status...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">AI Agents</h1>
        <p className="text-[#f85149]">Failed to load agent data</p>
      </div>
    );
  }

  const mailboxHealth =
    data.gmail.summary.connectedMailboxes === data.gmail.summary.totalMailboxes
      ? "good"
      : data.gmail.summary.disconnectedMailboxes > 0
        ? "bad"
        : "warn";

  return (
    <div>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">AI Agents</h1>
          <p className="text-[#8b949e] max-w-3xl">
            Monitor agent status, Gmail coverage, OAuth health, and the boring connection stuff that decides whether the robots are useful or just decorative.
          </p>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 text-sm">
          <p className="text-xs text-[#8b949e]">Email audit checked</p>
          <p className="font-mono text-[#e6edf3]">{formatTimeAgo(data.gmail.checkedAt)}</p>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-[#30363d] bg-[#161b22] p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e6edf3]">Gmail coverage</h2>
            <p className="mt-1 text-sm text-[#8b949e]">
              First answer: the scanner is connected to every configured Maverick Workspace Gmail mailbox in the latest audit.
            </p>
          </div>
          <ConnectionBadge status={mailboxHealth === "good" ? "connected" : mailboxHealth === "bad" ? "disconnected" : "partial"} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-5">
          <MiniStat
            label="Workspace Gmail"
            value={`${data.gmail.summary.connectedMailboxes}/${data.gmail.summary.totalMailboxes}`}
            tone={mailboxHealth}
          />
          <MiniStat
            label="Disconnected"
            value={data.gmail.summary.disconnectedMailboxes}
            tone={data.gmail.summary.disconnectedMailboxes > 0 ? "bad" : "good"}
          />
          <MiniStat
            label="Unknown"
            value={data.gmail.summary.unknownMailboxes}
            tone={data.gmail.summary.unknownMailboxes > 0 ? "warn" : "good"}
          />
          <MiniStat
            label="Integration issues"
            value={data.gmail.summary.integrationsPartial + data.gmail.summary.integrationsDisconnected}
            tone={data.gmail.summary.integrationsPartial + data.gmail.summary.integrationsDisconnected > 0 ? "warn" : "good"}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.gmail.mailboxes.map((mailbox) => (
            <div key={mailbox.account} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-[#e6edf3]">{mailbox.account}</p>
                  <p className="mt-1 text-xs text-[#8b949e]">{mailbox.access}</p>
                </div>
                <ConnectionBadge status={mailbox.status} />
              </div>
              <p className="mt-3 text-xs text-[#8b949e]">{mailbox.evidence}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-[#30363d] bg-[#161b22] p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[#e6edf3]">Connected vs disconnected surfaces</h2>
          <p className="mt-1 text-sm text-[#8b949e]">
            Gmail scanning can be green while Apps Script, gcloud, or Workspace admin tooling is still stale. Annoying, but accurate.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.gmail.integrations.map((integration) => (
            <div key={integration.id} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#e6edf3]">{integration.name}</p>
                  <p className="mt-1 text-xs text-[#8b949e]">{integration.detail}</p>
                </div>
                <ConnectionBadge status={integration.status} />
              </div>
              {integration.evidence ? (
                <p className="mt-3 text-xs text-[#8b949e]">{integration.evidence}</p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[#e6edf3]">Read this before panicking</h3>
          <ul className="space-y-1 text-xs text-[#8b949e]">
            {data.gmail.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {(
          Object.entries(AGENT_STATUS_COLORS) as [
            keyof typeof AGENT_STATUS_COLORS,
            (typeof AGENT_STATUS_COLORS)[keyof typeof AGENT_STATUS_COLORS],
          ][]
        ).map(([status, config]) => (
          <div key={status} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span>{config.icon}</span>
              <p className="text-xs text-[#8b949e] capitalize">{status}</p>
            </div>
            <p className="text-2xl font-bold text-[#e6edf3]">
              {status === "idle"
                ? data.summary.idleAgents
                : status === "active"
                  ? data.summary.activeAgents
                  : status === "sleeping"
                    ? data.summary.sleepingAgents
                    : data.summary.errorAgents}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {data.agents.map((agent) => {
          const statusConfig = AGENT_STATUS_COLORS[agent.status];
          return (
            <div key={agent.id} className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-[#e6edf3]">{agent.name}</h3>
                  <p className="text-xs text-[#8b949e]">{agent.role}</p>
                  <p className="text-[10px] text-[#8b949e] mt-1">{agent.description}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                  {agent.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-[#8b949e]">Last Heartbeat</p>
                  <p className="font-mono text-[#e6edf3]">{formatTimeAgo(agent.lastHeartbeat)}</p>
                </div>
                <div>
                  <p className="text-[#8b949e]">Tasks Processed</p>
                  <p className="font-mono text-[#e6edf3]">{agent.tasksProcessed}</p>
                </div>
                <div>
                  <p className="text-[#8b949e]">Today</p>
                  <p className="font-mono text-[#e6edf3]">
                    {agent.tasksToday} task{agent.tasksToday !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-[#8b949e]">Uptime</span>
                <span className="text-[#3fb950] font-mono">{agent.uptime}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">System Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MiniStat label="Total Agents" value={data.summary.totalAgents} />
          <MiniStat label="Tasks Today" value={data.summary.totalTasksToday} />
          <MiniStat label="Average Uptime" value={data.summary.averageUptime} tone="good" />
          <MiniStat label="System Health" value="Watch auth" tone="warn" />
        </div>
      </div>
    </div>
  );
}
