import { describe, expect, it } from "vitest";
import {
  isWithinReplyHours,
  nextAllowedReplyTime,
  replyPolicy,
} from "./policy";

const env = {
  REPLIES_ENABLED: "true",
  REPLIES_ALLOWED_EMAILS:
    "jack@maverickexteriorskc.com,michael@maverickexteriorskc.com",
};

describe("reply safety policy", () => {
  it("fails closed when the feature flag is absent", () => {
    expect(
      replyPolicy(
        "jack@maverickexteriorskc.com",
        "text",
        new Date("2026-10-28T15:00:00Z"),
        {}
      )
    ).toMatchObject({ enabled: false, canCompose: false, sendNow: false });
  });

  it("enforces the sender allowlist", () => {
    expect(
      replyPolicy(
        "other@maverickexteriorskc.com",
        "text",
        new Date("2026-10-28T15:00:00Z"),
        env
      )
    ).toMatchObject({ allowed: false, sendNow: false });
  });

  it("allows homeowner sends from 8am through 6:59pm Central", () => {
    expect(
      isWithinReplyHours(new Date("2026-10-28T13:00:00Z"), "text")
    ).toBe(true);
    expect(
      isWithinReplyHours(new Date("2026-10-29T00:00:00Z"), "email")
    ).toBe(false);
  });

  it("queues after hours for the next 8am Central", () => {
    expect(
      nextAllowedReplyTime(new Date("2026-10-29T01:00:00Z")).toISOString()
    ).toBe("2026-10-29T13:00:00.000Z");
  });

  it("always allows internal notes during allowed-user sessions", () => {
    expect(
      replyPolicy(
        "jack@maverickexteriorskc.com",
        "note",
        new Date("2026-10-29T03:00:00Z"),
        env
      ).sendNow
    ).toBe(true);
  });
});
