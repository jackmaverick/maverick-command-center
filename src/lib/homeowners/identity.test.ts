import { describe, expect, it } from "vitest";
import {
  normalizePhoneDigits,
  resolveContactIdentity,
} from "./identity";

describe("homeowner identity matching", () => {
  it("normalizes US phone numbers to comparable E.164 digits", () => {
    expect(normalizePhoneDigits("(913) 555-0123")).toBe("19135550123");
    expect(normalizePhoneDigits("+1 913-555-0123")).toBe("19135550123");
  });

  it("allows unique phone and email fallbacks", () => {
    const resolved = resolveContactIdentity("contact-1", [
      {
        contactJnid: "contact-1",
        phones: ["913-555-0123"],
        emails: ["HOMEOWNER@example.com"],
      },
      {
        contactJnid: "contact-2",
        phones: ["913-555-9999"],
        emails: ["other@example.com"],
      },
    ]);

    expect(resolved.phoneDigits).toEqual(["19135550123"]);
    expect(resolved.emails).toEqual(["homeowner@example.com"]);
  });

  it("never silently merges identities shared by multiple contacts", () => {
    const resolved = resolveContactIdentity("contact-1", [
      {
        contactJnid: "contact-1",
        phones: ["913-555-0123"],
        emails: ["shared@example.com"],
      },
      {
        contactJnid: "contact-2",
        phones: ["+1 913 555 0123"],
        emails: ["SHARED@example.com"],
      },
    ]);

    expect(resolved.phoneDigits).toEqual([]);
    expect(resolved.emails).toEqual([]);
    expect(resolved.ambiguousPhones).toEqual(["19135550123"]);
    expect(resolved.ambiguousEmails).toEqual(["shared@example.com"]);
  });
});
