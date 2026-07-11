/**
 * QBO refresh-token expiry alert.
 *
 * Called from /api/qbo/cron (every 15 min). When the active connection's
 * refresh token expires in under 14 days, emails an alert via Resend.
 * Deduped to at most one email per 24h via the qbo_alert_log table.
 */

import { query, queryOne } from "@/lib/db";

const ALERT_TYPE = "qbo_refresh_token_expiry";
const WARNING_DAYS = 14;
const DEDUPE_HOURS = 24;
const ALERT_RECIPIENT =
  process.env.QBO_ALERT_EMAIL ?? "jack@maverickexteriorskc.com";
const ALERT_FROM =
  process.env.RESEND_FROM ??
  "Maverick Command Center <alerts@maverickexteriorskc.com>";

interface ConnectionRow {
  id: string;
  refresh_token_expires_at: string | null;
}

async function ensureAlertLogTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS qbo_alert_log (
       id BIGSERIAL PRIMARY KEY,
       alert_type TEXT NOT NULL,
       detail TEXT,
       sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
}

async function sendResendEmail(subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(
      "[QBO Token Alert] RESEND_API_KEY not set — cannot send expiry alert email"
    );
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERT_FROM,
      to: [ALERT_RECIPIENT],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error(
      `[QBO Token Alert] Resend API error ${res.status}: ${await res.text()}`
    );
    return false;
  }
  return true;
}

/**
 * Check refresh token expiry and alert if < WARNING_DAYS out.
 * Never throws — failures are logged so the sync cron is unaffected.
 */
export async function checkRefreshTokenExpiry(): Promise<{
  checked: boolean;
  daysRemaining: number | null;
  alertSent: boolean;
}> {
  try {
    const conn = await queryOne<ConnectionRow>(
      `SELECT id, refresh_token_expires_at::text
       FROM qbo_connection
       WHERE status = 'active'
       ORDER BY connected_at DESC
       LIMIT 1`
    );
    if (!conn?.refresh_token_expires_at) {
      return { checked: false, daysRemaining: null, alertSent: false };
    }

    const expiresAt = new Date(conn.refresh_token_expires_at);
    const daysRemaining =
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    const daysRounded = Math.floor(daysRemaining * 10) / 10;

    if (daysRemaining >= WARNING_DAYS) {
      return { checked: true, daysRemaining: daysRounded, alertSent: false };
    }

    await ensureAlertLogTable();

    // Dedupe: at most one alert per 24 hours
    const recent = await queryOne<{ id: string }>(
      `SELECT id FROM qbo_alert_log
       WHERE alert_type = $1
         AND sent_at > NOW() - ($2 || ' hours')::interval
       LIMIT 1`,
      [ALERT_TYPE, String(DEDUPE_HOURS)]
    );
    if (recent) {
      return { checked: true, daysRemaining: daysRounded, alertSent: false };
    }

    const expired = daysRemaining <= 0;
    const subject = expired
      ? "URGENT: QuickBooks connection expired — reconnect required"
      : `QuickBooks token expires in ${Math.max(0, Math.floor(daysRemaining))} days — reconnect soon`;
    const html = `
      <h2>QuickBooks refresh token ${expired ? "has EXPIRED" : "is expiring"}</h2>
      <p>The Maverick Command Center QuickBooks connection's refresh token
         ${expired ? "expired" : "expires"} on
         <strong>${expiresAt.toLocaleDateString("en-US", { dateStyle: "long" })}</strong>
         (${daysRounded} days from now).</p>
      <p>If it lapses, QBO sync (invoices, payments, P&amp;L, cash flow, reconciliation)
         stops until reconnected.</p>
      <p><strong>Fix:</strong> open
         <a href="https://maverick-command-center.vercel.app/settings">Command Center → Settings</a>
         and click <em>Reconnect QuickBooks</em>. Takes about 30 seconds.</p>
      <p style="color:#888;font-size:12px">Automated alert from /api/qbo/cron.
         Repeats daily until resolved.</p>
    `;

    const sent = await sendResendEmail(subject, html);
    if (sent) {
      await query(
        `INSERT INTO qbo_alert_log (alert_type, detail) VALUES ($1, $2)`,
        [
          ALERT_TYPE,
          `refresh token expires ${expiresAt.toISOString()} (${daysRounded} days); alerted ${ALERT_RECIPIENT}`,
        ]
      );
    }
    return { checked: true, daysRemaining: daysRounded, alertSent: sent };
  } catch (error) {
    console.error(
      "[QBO Token Alert] Check failed:",
      error instanceof Error ? error.message : String(error)
    );
    return { checked: false, daysRemaining: null, alertSent: false };
  }
}
