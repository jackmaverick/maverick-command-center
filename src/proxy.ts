import { NextRequest, NextResponse } from "next/server";
import {
  hasBearerToken,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/qbo/callback",
  "/api/qbo/webhook",
]);

const CRON_PATHS = new Set([
  "/api/qbo/cron",
  "/api/qbo/sheet-sync",
  "/api/snapshots/generate",
  "/api/sync",
  "/api/loop-health",
]);

function unauthorized(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // These endpoints perform their own fail-closed authentication:
  // login sets the signed session, QBO callback validates signed OAuth state,
  // and the webhook validates Intuit's request signature against its verifier.
  if (PUBLIC_PATHS.has(path)) return NextResponse.next();

  if (CRON_PATHS.has(path) && hasBearerToken(request, "CRON_SECRET")) {
    return NextResponse.next();
  }

  if (
    path === "/api/recovery" &&
    hasBearerToken(request, "ADMIN_RECOVERY_KEY")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(session)) return NextResponse.next();

  return unauthorized(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
