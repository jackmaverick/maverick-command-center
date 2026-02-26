const INTEGRATIONS = [
  {
    name: "JobNimbus",
    description: "CRM — contacts, jobs, estimates, invoices, status history",
    status: "connected",
    lastSync: "-- min ago",
  },
  {
    name: "Supabase",
    description: "Database — JN mirror tables, Roofle events, material costs",
    status: "connected",
    lastSync: "Live",
  },
  {
    name: "OpenPhone",
    description: "Call & text logs for speed-to-lead tracking",
    status: "connected",
    lastSync: "-- min ago",
  },
  {
    name: "Roofle",
    description: "Instant roof quote webhooks and lead capture",
    status: "connected",
    lastSync: "Webhook",
  },
  {
    name: "Vercel",
    description: "Website auto-deployment on git push",
    status: "connected",
    lastSync: "On push",
  },
  {
    name: "Command Center",
    description: "Task management and activity feed API",
    status: "connected",
    lastSync: "-- min ago",
  },
];

const STATUS_BADGE = {
  connected: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    label: "Connected",
  },
  disconnected: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    label: "Disconnected",
  },
  pending: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    label: "Pending",
  },
};

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">Settings</h1>
      <p className="text-[#8b949e] mb-8">
        Manage integrations, sync schedules, and dashboard configuration.
      </p>

      {/* Integrations */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Integrations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INTEGRATIONS.map((integration) => {
            const badge =
              STATUS_BADGE[
                integration.status as keyof typeof STATUS_BADGE
              ];
            return (
              <div
                key={integration.name}
                className="bg-[#161b22] border border-[#30363d] rounded-lg p-5"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[#e6edf3]">
                    {integration.name}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.text}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="text-xs text-[#8b949e] mb-3">
                  {integration.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8b949e]">
                    Last sync: {integration.lastSync}
                  </span>
                  <button className="text-xs text-[#58a6ff] hover:underline">
                    Configure
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sync settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Data Sync Schedule
          </h2>
          <div className="space-y-3">
            {[
              {
                task: "JN Full Sync",
                schedule: "Every 15 minutes",
                lastRun: "--:-- AM",
              },
              {
                task: "Weekly Snapshot",
                schedule: "Sundays at midnight",
                lastRun: "Feb 23, 2026",
              },
              {
                task: "Material Cost Sync",
                schedule: "On invoice received",
                lastRun: "--:-- PM",
              },
              {
                task: "Nightly Compound Review",
                schedule: "Daily at 10:30 PM",
                lastRun: "--:-- PM",
              },
            ].map((item) => (
              <div
                key={item.task}
                className="flex items-center justify-between bg-[#21262d] rounded-lg px-4 py-3"
              >
                <div>
                  <p className="text-sm text-[#e6edf3]">{item.task}</p>
                  <p className="text-xs text-[#8b949e]">{item.schedule}</p>
                </div>
                <span className="text-xs font-mono text-[#8b949e]">
                  {item.lastRun}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Dashboard Configuration
          </h2>
          <div className="space-y-4">
            {[
              {
                label: "Default Period",
                value: "This Month",
                type: "select",
              },
              {
                label: "Default Segment",
                value: "All Segments",
                type: "select",
              },
              {
                label: "Auto-refresh Interval",
                value: "5 minutes",
                type: "select",
              },
              {
                label: "Show Archived Jobs",
                value: "Off",
                type: "toggle",
              },
            ].map((setting) => (
              <div
                key={setting.label}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-[#e6edf3]">{setting.label}</span>
                <div className="bg-[#21262d] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#8b949e] min-w-[120px] text-center">
                  {setting.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Database info */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Database Info
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Supabase Project", value: "biewckagexvxrehccaoo" },
            { label: "Total Jobs Synced", value: "---" },
            { label: "Total Contacts Synced", value: "---" },
          ].map((info) => (
            <div key={info.label} className="bg-[#21262d] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] mb-1">{info.label}</p>
              <p className="text-sm font-mono text-[#e6edf3]">{info.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
