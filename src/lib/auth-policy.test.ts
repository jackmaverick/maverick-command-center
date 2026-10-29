import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import {
  getAuthAccessConfig,
  getMissingAuthEnvironmentVariables,
  isAllowedEmail,
  isAllowedGoogleProfile,
  isAuthorizedSession,
  isRequestAuthorized,
} from "./auth-policy";

const configured = getAuthAccessConfig({
  AUTH_SECRET: "test-secret",
  AUTH_GOOGLE_ID: "google-id",
  AUTH_GOOGLE_SECRET: "google-secret",
  AUTH_ALLOWED_DOMAIN: "maverickexteriorskc.com",
  AUTH_ALLOWED_EMAILS: "jack@example.com",
});

function session(email: string): Session {
  return {
    user: { email },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("auth access policy", () => {
  it.each([
    "AUTH_SECRET",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "AUTH_ALLOWED_DOMAIN",
  ])("fails closed when %s is missing at runtime", (missingVariable) => {
    const environment: Record<string, string> = {
      AUTH_SECRET: "test-secret",
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
      AUTH_ALLOWED_DOMAIN: "maverickexteriorskc.com",
    };
    delete environment[missingVariable];
    const missingConfig = getAuthAccessConfig(environment);

    expect(getMissingAuthEnvironmentVariables(environment)).toEqual([
      missingVariable,
    ]);
    expect(isAllowedEmail("jack@maverickexteriorskc.com", missingConfig)).toBe(
      false
    );
    expect(
      isRequestAuthorized(
        "/homeowners",
        session("jack@maverickexteriorskc.com"),
        missingConfig
      )
    ).toBe(false);
  });

  it("denies unauthenticated requests to pages and APIs", () => {
    expect(isAuthorizedSession(null, configured)).toBe(false);
    expect(isRequestAuthorized("/homeowners", null, configured)).toBe(false);
    expect(
      isRequestAuthorized("/api/homeowners/search", null, configured)
    ).toBe(false);
  });

  it("denies signed-in users from an unapproved domain", () => {
    expect(isAuthorizedSession(session("intruder@gmail.com"), configured)).toBe(
      false
    );
  });

  it("allows the Workspace domain and explicit exceptions", () => {
    expect(
      isAuthorizedSession(
        session("jack@maverickexteriorskc.com"),
        configured
      )
    ).toBe(true);
    expect(isAuthorizedSession(session("jack@example.com"), configured)).toBe(
      true
    );
  });

  it("requires a verified Google Workspace tenant for domain access", () => {
    expect(
      isAllowedGoogleProfile(
        {
          email: "jack@maverickexteriorskc.com",
          email_verified: true,
          hd: "maverickexteriorskc.com",
        },
        configured
      )
    ).toBe(true);
    expect(
      isAllowedGoogleProfile(
        {
          email: "jack@maverickexteriorskc.com",
          email_verified: true,
          hd: null,
        },
        configured
      )
    ).toBe(false);
    expect(
      isAllowedGoogleProfile(
        {
          email: "jack@maverickexteriorskc.com",
          email_verified: false,
          hd: "maverickexteriorskc.com",
        },
        configured
      )
    ).toBe(false);
  });

  it("allows verified explicit email exceptions without a Workspace tenant", () => {
    expect(
      isAllowedGoogleProfile(
        {
          email: "jack@example.com",
          email_verified: true,
          hd: null,
        },
        configured
      )
    ).toBe(true);
  });

  it("leaves OAuth and signed service endpoints reachable", () => {
    expect(isRequestAuthorized("/api/auth/session", null, configured)).toBe(
      true
    );
    expect(isRequestAuthorized("/api/qbo/cron", null, configured)).toBe(true);
  });
});
