"use client";

import { useQuery } from "@tanstack/react-query";
import { AGENT_STATUS_COLORS } from "@/lib/constants";

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: "idle" | "active" | "sleeping" | "error";
  lastHeartbeat: string;
  tasksProcessed: number;
  tasksToday: number;
  uptime: string;
}

interface AgentsResponse {
  agents: Agent[];
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

function formatTimeAgo(isoDate: string): string {
  const now = new Date();
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export default function AgentsPage() {
  const { data, isLoading, error } = useQuery<AgentsResponse>({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">AI Agents</h1>
      <p className="text-[#8b949e] mb-8">
        Monitor agent status, heartbeats, and task processing — the autonomous
        workforce behind Maverick operations.
      </p>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {(
          Object.entries(AGENT_STATUS_COLORS) as [
            keyof typeof AGENT_STATUS_COLORS,
            (typeof AGENT_STATUS_COLORS)[keyof typeof AGENT_STATUS_COLORS],
          ][]
        ).map(([status, config]) => (
          <div
            key={status}
            className="bg-[#161b22] border border-[#30363d] rounded-lg p-4"
          >
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

      {/* Agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {data.agents.map((agent) => {
          const statusConfig = AGENT_STATUS_COLORS[agent.status];
          return (
            <div
              key={agent.id}
              className="bg-[#161b22] border border-[#30363d] rounded-lg p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-[#e6edf3]">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-[#8b949e]">{agent.role}</p>
                  <p className="text-[10px] text-[#8b949e] mt-1">
                    {agent.description}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
                >
                  {agent.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-[#8b949e]">Last Heartbeat</p>
                  <p className="font-mono text-[#e6edf3]">
                    {formatTimeAgo(agent.lastHeartbeat)}
                  </p>
                </div>
                <div>
                  <p className="text-[#8b949e]">Tasks Processed</p>
                  <p className="font-mono text-[#e6edf3]">
                    {agent.tasksProcessed}
                  </p>
                </div>
                <div>
                  <p className="text-[#8b949e]">Today</p>
                  <p className="font-mono text-[#e6edf3]">
                    {agent.tasksToday} task{agent.tasksToday !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              {/* Uptime indicator */}
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-[#8b949e]">Uptime</span>
                <span className="text-[#3fb950] font-mono">{agent.uptime}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent summary stats */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          System Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Total Agents</p>
            <p className="text-2xl font-bold text-[#e6edf3]">
              {data.summary.totalAgents}
            </p>
          </div>
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Tasks Today</p>
            <p className="text-2xl font-bold text-[#e6edf3]">
              {data.summary.totalTasksToday}
            </p>
          </div>
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Average Uptime</p>
            <p className="text-2xl font-bold text-[#3fb950]">
              {data.summary.averageUptime}
            </p>
          </div>
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">System Health</p>
            <p className="text-2xl font-bold text-[#3fb950]">Good</p>
          </div>
        </div>
      </div>

      {/* Recent heartbeats timeline */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Recent Heartbeats
        </h2>
        <div className="space-y-2">
          {data.agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between bg-[#21262d] rounded px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#e6edf3] w-24">
                  {agent.name}
                </span>
                <span className="text-xs text-[#8b949e]">
                  Processed {agent.tasksToday} task
                  {agent.tasksToday !== 1 ? "s" : ""} today
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#8b949e]">
                  {formatTimeAgo(agent.lastHeartbeat)}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono text-[#8b949e] bg-[#161b22]">
                  {agent.uptime}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System status */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          System Status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Last Update</p>
            <p className="text-sm font-mono text-[#e6edf3]">
              {new Date().toLocaleTimeString()}
            </p>
          </div>
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">All Agents</p>
            <p className="text-sm font-mono text-[#3fb950] font-semibold">
              Operational
            </p>
          </div>
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">System Uptime</p>
            <p className="text-sm font-mono text-[#3fb950] font-semibold">
              {data.summary.averageUptime}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
