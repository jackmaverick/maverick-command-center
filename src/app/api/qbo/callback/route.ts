import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { exchangeCodeForTokens } from "@/lib/quickbooks";

function verifyState(state: string, cookieState: string): boolean {
  if (!state || !cookieState) return false;
  if (state !== cookieState) return false;

  // Verify HMAC signature
  const [rawState, hmac] = state.split(".");
  if (!rawState || !hmac) return false;

  const secret = process.env.QBO_CLIENT_SECRET;
  if (!secret) return false;

  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(rawState)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(hmac, "hex"),
    Buffer.from(expectedHmac, "hex")
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const realmId = searchParams.get("realmId");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Clear the state cookie regardless of outcome
    const clearCookie = (res: NextResponse) => {
      res.cookies.delete("qbo_oauth_state");
      return res;
    };

    if (error) {
      return clearCookie(
        NextResponse.redirect(
          new URL(`/settings?qbo_error=${encodeURIComponent(error)}`, request.url)
        )
      );
    }

    // Validate CSRF state
    const cookieState = request.cookies.get("qbo_oauth_state")?.value;
    console.log("[QBO Callback] State present:", !!state, "Cookie present:", !!cookieState, "Match:", state === cookieState);
    if (!state || !cookieState || !verifyState(state, cookieState)) {
      console.error("[QBO Callback] State validation failed — state:", state?.substring(0, 10), "cookie:", cookieState?.substring(0, 10));
      return clearCookie(
        NextResponse.redirect(
          new URL("/settings?qbo_error=invalid_state", request.url)
        )
      );
    }

    if (!code || !realmId) {
      return clearCookie(
        NextResponse.redirect(
          new URL("/settings?qbo_error=missing_params", request.url)
        )
      );
    }

    console.log("[QBO Callback] Exchanging code for tokens, realmId:", realmId);
    await exchangeCodeForTokens(code, realmId);
    console.log("[QBO Callback] Token exchange successful");

    return clearCookie(
      NextResponse.redirect(
        new URL("/settings?qbo_connected=true", request.url)
      )
    );
  } catch (error) {
    console.error("[QBO Callback] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const response = NextResponse.redirect(
      new URL(`/settings?qbo_error=${encodeURIComponent(msg)}`, request.url)
    );
    response.cookies.delete("qbo_oauth_state");
    return response;
  }
}
