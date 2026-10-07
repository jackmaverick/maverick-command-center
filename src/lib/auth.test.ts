import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "./auth";

const originalEnv = { ...process.env };

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`https://dashboard.example${path}`, init);
}

beforeEach(() => {
  process.env.DASHBOARD_PASSWORD = "test-password";
  process.env.SESSION_SECRET = "a".repeat(32);
  process.env.CRON_SECRET = "cron-test-secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("dashboard authentication", () => {
  it("fails closed when authentication env vars are missing", async () => {
    delete process.env.DASHBOARD_PASSWORD;
    delete process.env.SESSION_SECRET;

    expect((await proxy(request("/"))).status).toBe(307);
    expect((await proxy(request("/api/dashboard"))).status).toBe(401);
  });

  it("redirects an unauthenticated page and rejects an unauthenticated API", async () => {
    const pageResponse = await proxy(request("/sales?period=month"));
    expect(pageResponse.status).toBe(307);
    expect(pageResponse.headers.get("location")).toContain(
      "/login?next=%2Fsales%3Fperiod%3Dmonth",
    );

    const apiResponse = await proxy(request("/api/dashboard"));
    expect(apiResponse.status).toBe(401);
  });

  it("allows authenticated page and API requests", async () => {
    const token = await createSessionToken();
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${token}` };

    expect((await proxy(request("/", { headers }))).headers.get("x-middleware-next")).toBe("1");
    expect(
      (await proxy(request("/api/dashboard", { headers }))).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  });

  it("allows designated machine routes with CRON_SECRET only", async () => {
    const authorized = await proxy(
      request("/api/qbo/cron", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );
    expect(authorized.headers.get("x-middleware-next")).toBe("1");

    expect((await proxy(request("/api/qbo/cron"))).status).toBe(401);
    expect(
      (
        await proxy(
          request("/api/dashboard", {
            headers: { authorization: "Bearer cron-test-secret" },
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("rejects expired and tampered session cookies", async () => {
    const token = await createSessionToken(1_000);
    expect(await verifySessionToken(token, 1_000)).toBe(true);
    expect(await verifySessionToken(token, 50_000_000)).toBe(false);
    expect(await verifySessionToken(`${token}x`, 1_000)).toBe(false);
  });
});
