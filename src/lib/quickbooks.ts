/**
 * QuickBooks Online API Client
 * Handles OAuth token management, auto-refresh, and API requests.
 */

import crypto from "crypto";
import { query, queryOne } from "@/lib/db";

// ── Constants ─────────────────────────────────────────────────────────────────

const QBO_BASE_URL = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

const SCOPES = "com.intuit.quickbooks.accounting";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5min before expiry
const ALGORITHM = "aes-256-gcm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QBOConnection {
  id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  company_name: string | null;
  connected_at: string;
  last_sync_at: string | null;
  status: string;
}

interface QBOTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
}

export interface QBOQueryResponse<T = Record<string, unknown>> {
  QueryResponse: Record<string, T[] | number | undefined>;
}

export interface QBOReportResponse {
  Header: {
    Time: string;
    ReportName: string;
    ReportBasis: string;
    StartPeriod: string;
    EndPeriod: string;
    Currency: string;
    Option: { Name: string; Value: string }[];
  };
  Columns: {
    Column: { ColTitle: string; ColType: string; MetaData?: { Name: string; Value: string }[] }[];
  };
  Rows: {
    Row: QBOReportRow[];
  };
}

export interface QBOReportRow {
  type?: string;
  group?: string;
  Header?: { ColData: { value: string; id?: string }[] };
  Rows?: { Row: QBOReportRow[] };
  Summary?: { ColData: { value: string; id?: string }[] };
  ColData?: { value: string; id?: string }[];
}

// ── Encryption helpers ────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const key = process.env.QBO_ENCRYPTION_KEY;
  if (!key) throw new Error("QBO_ENCRYPTION_KEY environment variable not set");
  // Key should be 32 bytes (64 hex chars) for AES-256
  return Buffer.from(key, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  // Format: iv:authTag:ciphertext
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertext] = encrypted.split(":");
  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted token format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── Connection management ─────────────────────────────────────────────────────

function getEnv(): "sandbox" | "production" {
  return (process.env.QBO_ENVIRONMENT ?? "sandbox") as "sandbox" | "production";
}

function getBaseUrl(): string {
  return QBO_BASE_URL[getEnv()];
}

function getClientId(): string {
  const id = process.env.QBO_CLIENT_ID;
  if (!id) throw new Error("QBO_CLIENT_ID not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.QBO_CLIENT_SECRET;
  if (!secret) throw new Error("QBO_CLIENT_SECRET not set");
  return secret;
}

function getRedirectUri(): string {
  const uri = process.env.QBO_REDIRECT_URI;
  if (!uri) throw new Error("QBO_REDIRECT_URI not set");
  return uri;
}

/**
 * Generate the OAuth2 authorization URL for QuickBooks.
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${QBO_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  realmId: string,
  overrideRedirectUri?: string
): Promise<void> {
  const redirectUri = overrideRedirectUri || getRedirectUri();
  console.log("[QBO Token Exchange] Using redirect_uri:", redirectUri);
  console.log("[QBO Token Exchange] Using client_id:", getClientId().substring(0, 10) + "...");

  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64")}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[QBO Token Exchange] Failed:", response.status, error);
    console.error("[QBO Token Exchange] redirect_uri used:", redirectUri);
    throw new Error(`Token exchange failed: ${response.status} ${error}`);
  }

  const tokens: QBOTokenResponse = await response.json();
  const now = new Date();

  // Fetch company name
  let companyName: string | null = null;
  try {
    const companyRes = await fetch(
      `${getBaseUrl()}/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      }
    );
    if (companyRes.ok) {
      const data = await companyRes.json();
      companyName = data.CompanyInfo?.CompanyName ?? null;
    }
  } catch {
    // Non-critical, continue without company name
  }

  // Encrypt tokens before storing
  const encryptedAccess = encryptToken(tokens.access_token);
  const encryptedRefresh = encryptToken(tokens.refresh_token);

  const accessExpiry = new Date(now.getTime() + tokens.expires_in * 1000);
  const refreshExpiry = new Date(
    now.getTime() + tokens.x_refresh_token_expires_in * 1000
  );

  // Upsert connection
  await query(
    `INSERT INTO qbo_connection (realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, company_name, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     ON CONFLICT (realm_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       company_name = EXCLUDED.company_name,
       connected_at = NOW(),
       status = 'active'`,
    [realmId, encryptedAccess, encryptedRefresh, accessExpiry.toISOString(), refreshExpiry.toISOString(), companyName]
  );
}

/**
 * Get the active QBO connection from the database.
 */
export async function getQBOConnection(): Promise<QBOConnection | null> {
  return queryOne<QBOConnection>(
    `SELECT * FROM qbo_connection WHERE status = 'active' ORDER BY connected_at DESC LIMIT 1`
  );
}

/**
 * Get a valid access token, auto-refreshing if needed.
 * IMPORTANT: Refresh token changes on every refresh — always save the new one.
 */
export async function getAccessToken(): Promise<{ token: string; realmId: string }> {
  const conn = await getQBOConnection();
  if (!conn) throw new Error("No active QBO connection");

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  const now = Date.now();

  // If token is still valid (with buffer), decrypt and return
  if (expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
    return {
      token: decryptToken(conn.access_token),
      realmId: conn.realm_id,
    };
  }

  // Token expired or about to expire — refresh it
  const currentRefreshToken = decryptToken(conn.refresh_token);

  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64")}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    // If refresh fails, mark connection as needing re-auth
    await query(
      `UPDATE qbo_connection SET status = 'expired' WHERE id = $1`,
      [conn.id]
    );
    throw new Error(`Token refresh failed: ${response.status} ${error}`);
  }

  const tokens: QBOTokenResponse = await response.json();
  const refreshedAt = new Date();

  // CRITICAL: Always save the new refresh token
  const encryptedAccess = encryptToken(tokens.access_token);
  const encryptedRefresh = encryptToken(tokens.refresh_token);
  const accessExpiry = new Date(refreshedAt.getTime() + tokens.expires_in * 1000);
  const refreshExpiry = new Date(
    refreshedAt.getTime() + tokens.x_refresh_token_expires_in * 1000
  );

  await query(
    `UPDATE qbo_connection
     SET access_token = $1,
         refresh_token = $2,
         access_token_expires_at = $3,
         refresh_token_expires_at = $4
     WHERE id = $5`,
    [encryptedAccess, encryptedRefresh, accessExpiry.toISOString(), refreshExpiry.toISOString(), conn.id]
  );

  return { token: tokens.access_token, realmId: conn.realm_id };
}

/**
 * Revoke QBO tokens and mark connection as disconnected.
 */
export async function revokeConnection(): Promise<void> {
  const conn = await getQBOConnection();
  if (!conn) return;

  try {
    const refreshToken = decryptToken(conn.refresh_token);
    await fetch(QBO_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64")}`,
        Accept: "application/json",
      },
      body: JSON.stringify({ token: refreshToken }),
    });
  } catch {
    // Best-effort revocation
  }

  await query(
    `UPDATE qbo_connection SET status = 'disconnected' WHERE id = $1`,
    [conn.id]
  );
}

// ── QBO API helpers ───────────────────────────────────────────────────────────

/**
 * Execute a QBO Query Language query.
 */
export async function qboQuery<T = Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const { token, realmId } = await getAccessToken();

  const url = `${getBaseUrl()}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QBO query failed: ${response.status} ${error}`);
  }

  const data: QBOQueryResponse<T> = await response.json();
  // QBO returns the entity type as the key (e.g., "Invoice", "Payment")
  const queryResponse = data.QueryResponse;
  for (const key of Object.keys(queryResponse)) {
    if (Array.isArray(queryResponse[key])) {
      return queryResponse[key] as T[];
    }
  }
  return [];
}

/**
 * Fetch a QBO report (P&L, Balance Sheet, etc.).
 */
export async function qboReport(
  reportName: string,
  params: Record<string, string> = {}
): Promise<QBOReportResponse> {
  const { token, realmId } = await getAccessToken();

  const searchParams = new URLSearchParams(params);
  const url = `${getBaseUrl()}/v3/company/${realmId}/reports/${reportName}?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QBO report failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Read a single QBO entity by ID.
 */
export async function qboRead<T = Record<string, unknown>>(
  entityType: string,
  entityId: string
): Promise<T> {
  const { token, realmId } = await getAccessToken();

  const url = `${getBaseUrl()}/v3/company/${realmId}/${entityType.toLowerCase()}/${entityId}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QBO read failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data[entityType] as T;
}

/**
 * Update the last_sync_at timestamp on the connection.
 */
export async function updateLastSync(): Promise<void> {
  await query(
    `UPDATE qbo_connection SET last_sync_at = NOW() WHERE status = 'active'`
  );
}
