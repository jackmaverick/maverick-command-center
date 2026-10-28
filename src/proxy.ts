import type {
  NextFetchEvent,
  NextMiddleware,
  NextRequest,
} from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { NextAuthRequest } from "next-auth";
import {
  getAuthAccessConfig,
  getMissingAuthEnvironmentVariables,
  isServicePath,
  logMissingAuthConfiguration,
} from "@/lib/auth-policy";

const authenticatedProxy: NextMiddleware = auth(
  (_request: NextAuthRequest, _event: NextFetchEvent) => NextResponse.next()
);

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const accessConfig = getAuthAccessConfig();
  if (!accessConfig.configured) {
    if (isServicePath(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    logMissingAuthConfiguration(getMissingAuthEnvironmentVariables());
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication service is not configured; access denied" },
        { status: 503 }
      );
    }
    if (request.nextUrl.pathname === "/configuration-error") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/configuration-error", request.url));
  }

  return authenticatedProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
