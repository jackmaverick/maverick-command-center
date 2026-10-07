export const SESSION_COOKIE_NAME = "maverick_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const MIN_PASSWORD_LENGTH = 20;

const encoder = new TextEncoder();

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function isAuthConfigured(): boolean {
  return Boolean(
    getSessionSecret() &&
      process.env.DASHBOARD_PASSWORD &&
      process.env.DASHBOARD_PASSWORD.length >= MIN_PASSWORD_LENGTH,
  );
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const secret = getSessionSecret();
  if (!secret || !isAuthConfigured()) {
    throw new Error("Dashboard authentication is not configured");
  }

  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  const secret = getSessionSecret();
  if (!secret || !process.env.DASHBOARD_PASSWORD || !token) return false;

  const [payload, providedSignature, ...extra] = token.split(".");
  if (!payload || !providedSignature || extra.length > 0) return false;

  const expiresAt = Number(payload);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) {
    return false;
  }

  const expectedSignature = await sign(payload, secret);
  return constantTimeEqual(providedSignature, expectedSignature);
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password || !isAuthConfigured()) return false;

  const expected = await sign(password, password);
  const actual = await sign(candidate, password);
  return constantTimeEqual(actual, expected);
}

export function hasBearerToken(request: Request, envName: string): boolean {
  const expected = process.env[envName];
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function isSessionOrBearerAuthorized(
  request: Request,
  bearerEnvName: string,
): Promise<boolean> {
  if (hasBearerToken(request, bearerEnvName)) return true;

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === SESSION_COOKIE_NAME)?.[1];

  return verifySessionToken(cookie);
}
