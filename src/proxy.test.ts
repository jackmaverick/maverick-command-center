import { describe, expect, it } from "vitest";
import { isDashboardRequestAuthorized } from "./proxy";

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("dashboard basic authentication", () => {
  it("accepts the configured credentials", () => {
    expect(
      isDashboardRequestAuthorized(
        basic("maverick", "correct horse"),
        "maverick",
        "correct horse"
      )
    ).toBe(true);
  });

  it("rejects missing or incorrect credentials", () => {
    expect(
      isDashboardRequestAuthorized(null, "maverick", "correct horse")
    ).toBe(false);
    expect(
      isDashboardRequestAuthorized(
        basic("maverick", "wrong"),
        "maverick",
        "correct horse"
      )
    ).toBe(false);
  });
});
