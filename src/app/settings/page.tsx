"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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

interface QBOStatus {
  connected: boolean;
  companyName: string | null;
  lastSync: string | null;
  refreshTokenExpiresAt: string | null;
  status: string;
}

function QuickBooksCard() {
  const searchParams = useSearchParams();
  const [qboStatus, setQboStatus] = useState<QBOStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [oauthMessage, setOauthMessage] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const error = searchParams.get("qbo_error");
    const connected = searchParams.get("qbo_connected");
    if (error) {
      setOauthMessage({ success: false, message: `OAuth error: ${decodeURIComponent(error)}` });
      // Clean URL
      window.history.replaceState({}, "", "/settings");
    } else if (connected) {
      setOauthMessage({ success: true, message: "QuickBooks connected successfully!" });
      window.history.replaceState({}, "", "/settings");
    }
  }, [searchParams]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/qbo/status");
      if (res.ok) setQboStatus(await res.json());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/qbo/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncResult({ success: true, message: `Synced ${data.invoicesSynced} invoices, ${data.paymentsSynced} payments` });
      } else {
        setSyncResult({ success: false, message: data.error || `Sync failed (${res.status})` });
      }
      await fetchStatus();
    } catch (e) {
      setSyncResult({ success: false, message: e instanceof Error ? e.message : "Network error" });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/qbo/disconnect", { method: "POST" });
      await fetchStatus();
    } finally {
      setDisconnecting(false);
    }
  };

  const refreshExpiresAt = qboStatus?.refreshTokenExpiresAt
    ? new Date(qboStatus.refreshTokenExpiresAt)
    : null;
  const daysUntilExpiry = refreshExpiresAt
    ? Math.floor((refreshExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const showWarning = daysUntilExpiry !== null && daysUntilExpiry < 14;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-8">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">
            QuickBooks Online
          </h2>
          <p className="text-xs text-[#8b949e]">
            Financial data — P&L reports, invoices, payments, bank balances
          </p>
        </div>
        {qboStatus && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
              qboStatus.connected
                ? "bg-green-500/20 text-green-400"
                : qboStatus.status === "expired"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-red-500/20 text-red-400"
            }`}
          >
            {qboStatus.connected
              ? "Connected"
              : qboStatus.status === "expired"
                ? "Token Expired"
                : "Disconnected"}
          </span>
        )}
      </div>

      {oauthMessage && (
        <div className={`mb-3 px-3 py-2 rounded text-xs ${
          oauthMessage.success
            ? "bg-green-500/10 border border-green-500/20 text-green-400"
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          {oauthMessage.message}
        </div>
      )}

      {qboStatus?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8b949e]">Company</span>
            <span className="text-[#e6edf3] font-medium">
              {qboStatus.companyName ?? "Unknown"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8b949e]">Last Sync</span>
            <span className="text-[#e6edf3]">
              {qboStatus.lastSync
                ? new Date(qboStatus.lastSync).toLocaleString()
                : "Never"}
            </span>
          </div>
          {showWarning && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2 text-xs text-yellow-400">
              Token expires in {daysUntilExpiry} days. Re-authorize to avoid disconnection.
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 text-xs font-medium rounded bg-[#58a6ff]/10 text-[#58a6ff] hover:bg-[#58a6ff]/20 disabled:opacity-50 transition-colors"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            {(showWarning || qboStatus.status === "expired") && (
              <a
                href="/api/qbo/authorize"
                className="px-3 py-1.5 text-xs font-medium rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
              >
                Re-authorize
              </a>
            )}
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 text-xs font-medium rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors ml-auto"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
          {syncResult && (
            <div className={`mt-2 px-3 py-2 rounded text-xs ${
              syncResult.success
                ? "bg-green-500/10 border border-green-500/20 text-green-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}>
              {syncResult.message}
            </div>
          )}
        </div>
      ) : (
        <div className="pt-2">
          <a
            href="/api/qbo/authorize"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-[#2ea043] text-white hover:bg-[#3fb950] transition-colors"
          >
            Connect QuickBooks
          </a>
          {qboStatus?.status === "expired" && (
            <p className="text-xs text-yellow-400 mt-2">
              Your session expired. Please re-connect to restore access.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsContent() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">Settings</h1>
      <p className="text-[#8b949e] mb-8">
        Manage integrations, sync schedules, and dashboard configuration.
      </p>

      {/* QuickBooks Connection */}
      <QuickBooksCard />

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
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-8">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Database Info
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Supabase Project", value: "biewckagexvxrehccaoo" },
            { label: "Total Jobs Synced", value: "575+" },
            { label: "Total Contacts Synced", value: "400+" },
          ].map((info) => (
            <div key={info.label} className="bg-[#21262d] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] mb-1">{info.label}</p>
              <p className="text-sm font-mono text-[#e6edf3]">{info.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* API Documentation */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          API Documentation
        </h2>
        <div className="space-y-4">
          <div className="text-xs text-[#8b949e] space-y-2">
            <p>
              <strong>Base URL:</strong>
              <code className="ml-2 font-mono text-[#58a6ff]">
                http://localhost:3007/api
              </code>
            </p>
            <p>
              <strong>All endpoints support query params:</strong>
            </p>
            <ul className="ml-4 space-y-1">
              <li>
                • <code className="font-mono">?period=month</code> (week, month,
                quarter, ytd, all)
              </li>
              <li>
                • <code className="font-mono">?segment=real_estate</code>
                (retail, insurance, repairs)
              </li>
            </ul>
          </div>

          <div className="border-t border-[#30363d] pt-4 space-y-2">
            {[
              { name: "dashboard", desc: "KPIs & top-level metrics" },
              { name: "pipeline", desc: "Stage funnel & conversions" },
              { name: "sales", desc: "Per-rep performance" },
              { name: "segments", desc: "Segment-specific data" },
              { name: "speed-to-lead", desc: "Response times & velocity" },
              { name: "lead-sources", desc: "Lead ROI analysis" },
              { name: "snapshots", desc: "Historical weekly data" },
            ].map((ep) => (
              <div
                key={ep.name}
                className="flex items-center justify-between text-xs"
              >
                <code className="font-mono text-[#58a6ff]">
                  GET /{ep.name}
                </code>
                <span className="text-[#8b949e]">{ep.desc}</span>
              </div>
            ))}
          </div>

          <div className="bg-[#21262d] rounded-lg p-3 border border-[#30363d]">
            <p className="text-[10px] text-[#8b949e] font-mono">
              💡 <strong>Tip:</strong> All revenue metrics use accrual basis
              (invoice creation date). Conversion rates include all job statuses.
              Real Estate detected by custom field emoji.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
