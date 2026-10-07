import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  isAuthConfigured,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyPassword,
} from "@/lib/auth";

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === request.nextUrl.origin);
}

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function activeFailure(key: string, now: number) {
  const failure = failures.get(key);
  if (failure && failure.resetAt > now) return failure;
  failures.delete(key);
  return null;
}

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 },
    );
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const now = Date.now();
  const key = clientKey(request);
  const priorFailure = activeFailure(key, now);
  if (priorFailure && priorFailure.count >= MAX_FAILURES) {
    return NextResponse.json(
      { error: "Too many attempts" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((priorFailure.resetAt - now) / 1000)),
          ),
        },
      },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!(await verifyPassword(password))) {
    const count = (priorFailure?.count ?? 0) + 1;
    failures.set(key, { count, resetAt: now + FAILURE_WINDOW_MS });
    if (failures.size > 10_000) {
      for (const [storedKey, failure] of failures) {
        if (failure.resetAt <= now) failures.delete(storedKey);
      }
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  failures.delete(key);
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
