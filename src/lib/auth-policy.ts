import type { Session } from "next-auth";

const REQUIRED_AUTH_ENVIRONMENT_VARIABLES = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_ALLOWED_DOMAIN",
] as const;

const PUBLIC_PATHS = ["/login", "/configuration-error", "/api/auth"];
const SERVICE_PATHS = [
  "/api/qbo/cron",
  "/api/qbo/sheet-sync",
  "/api/qbo/webhook",
  "/api/snapshots/generate",
];

export interface AuthAccessConfig {
  domain: string | null;
  allowedEmails: Set<string>;
  configured: boolean;
}

export function getMissingAuthEnvironmentVariables(
  env: Record<string, string | undefined> = process.env
): string[] {
  return REQUIRED_AUTH_ENVIRONMENT_VARIABLES.filter(
    (name) => !env[name]?.trim()
  );
}

export function logMissingAuthConfiguration(
  missing: string[] = getMissingAuthEnvironmentVariables()
): void {
  console.error(
    `[Auth] Access denied: missing required runtime configuration: ${missing.join(", ")}`
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAuthAccessConfig(
  env: Record<string, string | undefined> = process.env
): AuthAccessConfig {
  const domain = env.AUTH_ALLOWED_DOMAIN?.trim().toLowerCase() || null;
  const allowedEmails = new Set(
    (env.AUTH_ALLOWED_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );

  return {
    domain,
    allowedEmails,
    configured: getMissingAuthEnvironmentVariables(env).length === 0,
  };
}

export function isAllowedEmail(
  email: string | null | undefined,
  config: AuthAccessConfig = getAuthAccessConfig()
): boolean {
  if (!config.configured || !email) return false;

  const normalized = normalizeEmail(email);
  return (
    config.allowedEmails.has(normalized) ||
    normalized.endsWith(`@${config.domain}`)
  );
}

export function isAllowedGoogleProfile(
  profile: {
    email?: string | null;
    email_verified?: boolean | null;
    hd?: string | null;
  },
  config: AuthAccessConfig = getAuthAccessConfig()
): boolean {
  if (!config.configured || profile.email_verified !== true || !profile.email) {
    return false;
  }

  const email = normalizeEmail(profile.email);
  if (config.allowedEmails.has(email)) return true;

  return (
    email.endsWith(`@${config.domain}`) &&
    profile.hd?.trim().toLowerCase() === config.domain
  );
}

export function isAuthorizedSession(
  session: Session | null,
  config: AuthAccessConfig = getAuthAccessConfig()
): boolean {
  return isAllowedEmail(session?.user?.email, config);
}

export function isPublicOrServicePath(pathname: string): boolean {
  return isPublicPath(pathname) || isServicePath(pathname);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isServicePath(pathname: string): boolean {
  return SERVICE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isRequestAuthorized(
  pathname: string,
  session: Session | null,
  config: AuthAccessConfig = getAuthAccessConfig()
): boolean {
  if (isPublicOrServicePath(pathname)) return true;
  return isAuthorizedSession(session, config);
}
