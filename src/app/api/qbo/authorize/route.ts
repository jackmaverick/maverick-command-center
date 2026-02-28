import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthorizationUrl } from "@/lib/quickbooks";

export async function GET() {
  try {
    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString("hex");

    // HMAC-sign the state so we can verify it on callback
    const secret = process.env.QBO_CLIENT_SECRET;
    if (!secret) throw new Error("QBO_CLIENT_SECRET not set");
    const hmac = crypto.createHmac("sha256", secret).update(state).digest("hex");
    const signedState = `${state}.${hmac}`;

    const url = getAuthorizationUrl(signedState);

    // Store state in a secure, httpOnly cookie for validation on callback
    const response = NextResponse.redirect(url);
    response.cookies.set("qbo_oauth_state", signedState, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/qbo/callback",
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
