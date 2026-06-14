/**
 * Google Sheets writer — service-account auth + minimal REST helpers.
 *
 * Auth uses a Google service account (JWT). Set these env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL        — the service account's email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  — its private key (PEM; \n-escaped is fine)
 * Then share the target spreadsheet with that email (Editor).
 *
 * When the env vars are absent, isSheetsConfigured() returns false and callers
 * should no-op — this keeps the cron green until setup is finished.
 */

import { JWT } from "google-auth-library";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function isSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

let cachedClient: JWT | null = null;

function getClient(): JWT {
  if (cachedClient) return cachedClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Google Sheets service-account env vars not set");
  }
  // Vercel stores multiline secrets with literal \n — normalize back to newlines.
  const key = rawKey.replace(/\\n/g, "\n");
  cachedClient = new JWT({ email, key, scopes: [SCOPE] });
  return cachedClient;
}

async function authHeader(): Promise<Record<string, string>> {
  const client = getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google access token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** List the tab (sheet) titles in a spreadsheet. */
async function getTabTitles(spreadsheetId: string): Promise<string[]> {
  const headers = await authHeader();
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`,
    { headers }
  );
  if (!res.ok) {
    throw new Error(`Sheets get failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  return (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
}

/**
 * Ensure a tab exists; create it with a header row if missing.
 * Returns true if it was created this call.
 */
export async function ensureTab(
  spreadsheetId: string,
  tabTitle: string,
  header: string[]
): Promise<boolean> {
  const titles = await getTabTitles(spreadsheetId);
  if (titles.includes(tabTitle)) return false;

  const headers = await authHeader();
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabTitle } } }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Sheets addSheet failed: ${res.status} ${await res.text()}`);
  }
  await updateRange(spreadsheetId, `${tabTitle}!A1`, [header]);
  return true;
}

/** Append one or more rows to the end of a tab's data. */
export async function appendRows(
  spreadsheetId: string,
  range: string,
  rows: (string | number)[][]
): Promise<void> {
  const headers = await authHeader();
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) {
    throw new Error(`Sheets append failed: ${res.status} ${await res.text()}`);
  }
}

/** Overwrite a range (e.g. a single cell "Tab!B5") with the given values. */
export async function updateRange(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<void> {
  const headers = await authHeader();
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    `?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    throw new Error(`Sheets update failed: ${res.status} ${await res.text()}`);
  }
}
