import { AGENT_STATUS_COLORS } from "@/lib/constants";

const PLACEHOLDER_AGENTS = [
  {
    name: "Coordinator",
    role: "Task routing & orchestration",
    status: "idle" as const,
    lastHeartbeat: "2 min ago",
    tasksProcessed: "--",
  },
  {
    name: "Compound Engineer",
    role: "Session learning extraction",
    status: "sleeping" as const,
    lastHeartbeat: "6 hrs ago",
    tasksProcessed: "--",
  },
  {
    name: "Developer",
    role: "Feature implementation",
    status: "idle" as const,
    lastHeartbeat: "15 min ago",
    tasksProcessed: "--",
  },
  {
    name: "Content Writer",
    role: "Copy & documentation",
    status: "idle" as const,
    lastHeartbeat: "1 hr ago",
    tasksProcessed: "--",
  },
];

export default function AgentsPage() {
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
                ? PLACEHOLDER_AGENTS.filter((a) => a.status === "idle").length
                : status === "sleeping"
                  ? PLACEHOLDER_AGENTS.filter((a) => a.status === "sleeping")
                      .length
                  : "--"}
            </p>
          </div>
        ))}
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {PLACEHOLDER_AGENTS.map((agent) => {
          const statusConfig = AGENT_STATUS_COLORS[agent.status];
          return (
            <div
              key={agent.name}
              className="bg-[#161b22] border border-[#30363d] rounded-lg p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-[#e6edf3]">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-[#8b949e]">{agent.role}</p>
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
                    {agent.lastHeartbeat}
                  </p>
                </div>
                <div>
                  <p className="text-[#8b949e]">Tasks Processed</p>
                  <p className="font-mono text-[#e6edf3]">
                    {agent.tasksProcessed}
                  </p>
                </div>
                <div>
                  <p className="text-[#8b949e]">Current Task</p>
                  <p className="font-mono text-[#8b949e]">None</p>
                </div>
              </div>
              {/* Activity sparkline placeholder */}
              <div className="mt-4 h-8 bg-[#21262d] rounded flex items-center justify-center">
                <span className="text-[10px] text-[#8b949e]">
                  Activity timeline
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent heartbeats */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Recent Heartbeats
        </h2>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-[#21262d] rounded px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-4 w-24 bg-[#30363d] rounded animate-pulse" />
                <div className="h-4 w-48 bg-[#30363d] rounded animate-pulse" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-4 w-16 bg-[#30363d] rounded animate-pulse" />
                <div className="h-4 w-20 bg-[#30363d] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nightly compound review status */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Nightly Compound Review
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Last Run</p>
            <p className="text-sm font-mono text-[#e6edf3]">--:-- PM</p>
          </div>
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Tasks Extracted</p>
            <p className="text-sm font-mono text-[#e6edf3]">--</p>
          </div>
          <div className="bg-[#21262d] rounded-lg p-4">
            <p className="text-xs text-[#8b949e] mb-1">Learnings Logged</p>
            <p className="text-sm font-mono text-[#e6edf3]">--</p>
          </div>
        </div>
      </div>
    </div>
  );
}
