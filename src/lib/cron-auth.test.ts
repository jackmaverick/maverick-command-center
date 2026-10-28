import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

describe("cron authorization", () => {
  it("fails closed when CRON_SECRET is missing", () => {
    expect(isCronAuthorized(new Headers(), undefined)).toBe(false);
  });

  it("accepts the Vercel Cron bearer token", () => {
    expect(
      isCronAuthorized(
        new Headers({ authorization: "Bearer expected" }),
        "expected"
      )
    ).toBe(true);
  });

  it("rejects an incorrect secret", () => {
    expect(
      isCronAuthorized(
        new Headers({ authorization: "Bearer wrong" }),
        "expected"
      )
    ).toBe(false);
  });
});
