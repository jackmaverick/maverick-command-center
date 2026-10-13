import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { POST } from "./route";

const originalEnv = { ...process.env };

function loginRequest(password: string, ip: string) {
  return new NextRequest("https://dashboard.example/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://dashboard.example",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ password }),
  });
}

beforeEach(() => {
  process.env.DASHBOARD_PASSWORD = "a-random-password-over-20-chars";
  process.env.SESSION_SECRET = "s".repeat(32);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("POST /api/auth/login", () => {
  it("sets the signed HttpOnly session cookie for valid credentials", async () => {
    const response = await POST(
      loginRequest("a-random-password-over-20-chars", "192.0.2.1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rate limits repeated failures by forwarded client IP", async () => {
    const ip = "192.0.2.2";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await POST(loginRequest("wrong-password", ip))).status).toBe(401);
    }

    const limited = await POST(loginRequest("wrong-password", ip));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});
