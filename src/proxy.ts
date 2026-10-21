import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function isDashboardRequestAuthorized(
  authorization: string | null,
  expectedUsername: string,
  expectedPassword: string
): boolean {
  if (!authorization?.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8"
    );
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;

    return (
      secureEqual(decoded.slice(0, separator), expectedUsername) &&
      secureEqual(decoded.slice(separator + 1), expectedPassword)
    );
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  if (!expectedPassword) return NextResponse.next();

  const expectedUsername = process.env.DASHBOARD_USERNAME ?? "maverick";
  if (
    isDashboardRequestAuthorized(
      request.headers.get("authorization"),
      expectedUsername,
      expectedPassword
    )
  ) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "Cache-Control": "private, no-store",
      "WWW-Authenticate": 'Basic realm="Maverick Command Center"',
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|legal/|api/qbo/callback|api/qbo/webhook|api/qbo/cron|api/qbo/sheet-sync|api/sync|api/recovery).*)",
  ],
};
