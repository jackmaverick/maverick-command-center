import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type AgentStatus = "idle" | "active" | "sleeping" | "error";
type ConnectionStatus = "connected" | "partial" | "disconnected" | "unknown";

type HealthCheckRow = {
  status: string;
  checked_at: string;
  finding: string | null;
  details: {
    audit_output_tail?: string;
    checks?: Array<{
      status: string;
      finding: string;
      details?: {
        audit_output_tail?: string;
      };
    }>;
  } | null;
};

type MailboxConnection = {
  account: string;
  status: ConnectionStatus;
  access: string;
  evidence: string;
};

type IntegrationConnection = {
  id: string;
  name: string;
  status: ConnectionStatus;
  detail: string;
  evidence?: string;
};

const EXPECTED_WORKSPACE_MAILBOXES = [
  "info@maverickexteriorskc.com",
  "michael@maverickexteriorskc.com",
  "bob@maverickexteriorskc.com",
  "chester@maverickexteriorskc.com",
  "claims@maverickexteriorskc.com",
  "scout@maverickexteriorskc.com",
  "brent@maverickexteriorskc.com",
  "jack@maverickexteriorskc.com",
];

const STATIC_AGENTS: Array<{
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  lastHeartbeat: string;
  tasksProcessed: number;
  tasksToday: number;
  uptime: string;
}> = [
  {
    id: "hermes",
    name: "Hermes",
    role: "Operator, QA, system guardian",
    description: "Monitors Scout, checks auth surfaces, handles quick execution.",
    status: "active",
    lastHeartbeat: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    tasksProcessed: 47,
    tasksToday: 5,
    uptime: "99.2%",
  },
  {
    id: "scout",
    name: "Scout / OpenClaw",
    role: "Growth strategist and planner",
    description: "Runs strategy, research, planning, and higher-reasoning build work.",
    status: "idle",
    lastHeartbeat: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    tasksProcessed: 156,
    tasksToday: 12,
    uptime: "99.7%",
  },
  {
    id: "paperclip",
    name: "Paperclip Agents",
    role: "Specialist action agents",
    description: "Handles routed Maverick operations tasks when an action is required.",
    status: "idle",
    lastHeartbeat: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    tasksProcessed: 89,
    tasksToday: 3,
    uptime: "99.5%",
  },
  {
    id: "compound-engineer",
    name: "Compound Engineer",
    role: "Session learning extraction",
    description: "Extracts learnings from sessions and updates memory files.",
    status: "sleeping",
    lastHeartbeat: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    tasksProcessed: 12,
    tasksToday: 0,
    uptime: "98.8%",
  },
];

function extractAuditOutput(row: HealthCheckRow | null): string {
  if (!row?.details) return "";
  const direct = row.details.audit_output_tail ?? "";
  const nested =
    row.details.checks
      ?.map((check) => check.details?.audit_output_tail ?? "")
      .filter(Boolean)
      .join("\n") ?? "";
  return [direct, nested].filter(Boolean).join("\n");
}

function buildMailboxConnections(auditOutput: string): MailboxConnection[] {
  return EXPECTED_WORKSPACE_MAILBOXES.map((account) => {
    const escaped = account.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const okMatch = auditOutput.match(
      new RegExp(`OK\\s+${escaped}:\\s+([^\\n]+)`, "i")
    );
    const failMatch = auditOutput.match(
      new RegExp(`FAIL\\s+${escaped}:\\s+([^\\n]+)`, "i")
    );

    if (okMatch) {
      return {
        account,
        status: "connected",
        access: "Gmail readonly + modify via Workspace service account",
        evidence: okMatch[1].trim(),
      };
    }

    if (failMatch) {
      return {
        account,
        status: "disconnected",
        access: "Workspace service account",
        evidence: failMatch[1].trim(),
      };
    }

    return {
      account,
      status: "unknown",
      access: "Workspace service account",
      evidence: "No recent audit line found for this mailbox.",
    };
  });
}

function lineStatus(auditOutput: string, okKey: string, failKey: string): ConnectionStatus {
  if (auditOutput.includes(`OK   ${okKey}`)) return "connected";
  if (auditOutput.includes(`FAIL ${failKey}`) || auditOutput.includes(`FAIL ${okKey}`)) return "disconnected";
  return "unknown";
}

function extractLine(auditOutput: string, key: string): string | undefined {
  const match = auditOutput.match(new RegExp(`(?:OK|FAIL|SKIP)\\s+${key}:\\s+([^\\n]+)`, "i"));
  return match?.[1]?.trim();
}

function buildIntegrations(auditOutput: string): IntegrationConnection[] {
  const workspaceReady = lineStatus(
    auditOutput,
    "workspace_scanner_ready",
    "workspace_scanner_ready"
  );
  const yahooReady = lineStatus(auditOutput, "yahoo_scanner_ready", "yahoo_scanner_ready");
  const hermesGmail = lineStatus(
    auditOutput,
    "hermes_gmail_modify_account",
    "hermes_gmail_modify_account"
  );
  const hermesFull = lineStatus(
    auditOutput,
    "hermes_workspace_ready",
    "hermes_workspace_ready"
  );
  const appsScript = lineStatus(
    auditOutput,
    "apps_script_cli_ready",
    "apps_script_cli_ready"
  );
  const gcloudRefresh = lineStatus(
    auditOutput,
    "gcloud_user_token_refresh",
    "gcloud_user_token_refresh"
  );
  const claspList = lineStatus(auditOutput, "clasp_script_list", "clasp_script_list");
  const gamAuth = lineStatus(auditOutput, "gam_auth_config", "gam_auth_config");

  return [
    {
      id: "workspace-gmail-scanner",
      name: "Workspace Gmail scanner",
      status: workspaceReady,
      detail: "Domain service account access for configured Maverick Gmail mailboxes.",
      evidence: extractLine(auditOutput, "workspace_scanner_ready"),
    },
    {
      id: "yahoo-imap",
      name: "Yahoo IMAP scanner",
      status: yahooReady,
      detail: "Legacy Yahoo mailbox scanner access.",
      evidence: extractLine(auditOutput, "yahoo_scanner_ready"),
    },
    {
      id: "hermes-gmail",
      name: "Hermes Gmail OAuth",
      status: hermesGmail,
      detail: "User-level Gmail access for Hermes. Latest audit shows Jack mailbox label access.",
      evidence: extractLine(auditOutput, "hermes_gmail_modify_account"),
    },
    {
      id: "hermes-full-workspace",
      name: "Hermes full Workspace scopes",
      status: hermesFull === "connected" ? "connected" : "partial",
      detail: "Hermes Gmail works, but Drive, Docs, and Apps Script scopes are separate checks.",
      evidence: extractLine(auditOutput, "hermes_workspace_ready"),
    },
    {
      id: "gcloud-user-auth",
      name: "gcloud user token",
      status: gcloudRefresh,
      detail: "Google Cloud CLI user refresh for Jack account.",
      evidence: extractLine(auditOutput, "gcloud_user_token_refresh"),
    },
    {
      id: "clasp-apps-script",
      name: "Apps Script CLI / clasp",
      status: claspList,
      detail: "Needed for Google Apps Script project work.",
      evidence: extractLine(auditOutput, "clasp_script_list"),
    },
    {
      id: "gam-admin",
      name: "Workspace admin CLI / GAM",
      status: gamAuth,
      detail: "Optional admin tooling. Not required for current scanner continuity.",
      evidence: extractLine(auditOutput, "gam_auth_config"),
    },
    {
      id: "apps-script-ready",
      name: "Apps Script readiness",
      status: appsScript,
      detail: "Aggregate local Apps Script and Google CLI readiness check.",
      evidence: extractLine(auditOutput, "apps_script_cli_ready"),
    },
  ];
}

function connectionCounts(items: Array<{ status: ConnectionStatus }>) {
  return items.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { connected: 0, partial: 0, disconnected: 0, unknown: 0 }
  );
}

export async function GET() {
  try {
    const rows = await query<HealthCheckRow>(
      `SELECT status, checked_at, finding, details
       FROM health_checks
       WHERE check_name = 'email_access_guard'
       ORDER BY checked_at DESC
       LIMIT 12`
    );

    const latestOverall = rows.find((row) => row.details?.checks) ?? rows[0] ?? null;
    const latestAudit =
      rows.find((row) => row.details?.audit_output_tail) ?? latestOverall ?? null;
    const auditOutput = extractAuditOutput(latestAudit);
    const mailboxes = buildMailboxConnections(auditOutput);
    const integrations = buildIntegrations(auditOutput);
    const mailboxCounts = connectionCounts(mailboxes);
    const integrationCounts = connectionCounts(integrations);

    return NextResponse.json(
      {
        agents: STATIC_AGENTS,
        gmail: {
          checkedAt: latestAudit?.checked_at ?? null,
          finding: latestAudit?.finding ?? null,
          summary: {
            totalMailboxes: mailboxes.length,
            connectedMailboxes: mailboxCounts.connected,
            disconnectedMailboxes: mailboxCounts.disconnected,
            unknownMailboxes: mailboxCounts.unknown,
            integrationsConnected: integrationCounts.connected,
            integrationsPartial: integrationCounts.partial,
            integrationsDisconnected: integrationCounts.disconnected,
            integrationsUnknown: integrationCounts.unknown,
          },
          mailboxes,
          integrations,
          notes: [
            "Configured Workspace Gmail mailboxes are checked through the scanner service account, not individual per-user gog tokens.",
            "User-level OAuth is separate: local gog currently has Brent Gmail, while Hermes Gmail OAuth is reading Jack's mailbox in the latest audit.",
            "Apps Script, Drive, Docs, gcloud, and GAM are separate connection surfaces and can be disconnected even when Gmail scanning works.",
          ],
        },
        summary: {
          totalAgents: STATIC_AGENTS.length,
          activeAgents: STATIC_AGENTS.filter((a) => a.status === "active").length,
          idleAgents: STATIC_AGENTS.filter((a) => a.status === "idle").length,
          sleepingAgents: STATIC_AGENTS.filter((a) => a.status === "sleeping").length,
          errorAgents: STATIC_AGENTS.filter((a) => a.status === "error").length,
          totalTasksToday: STATIC_AGENTS.reduce((sum, a) => sum + a.tasksToday, 0),
          averageUptime:
            (
              STATIC_AGENTS.reduce((sum, a) => sum + parseFloat(a.uptime), 0) /
              STATIC_AGENTS.length
            ).toFixed(1) + "%",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
