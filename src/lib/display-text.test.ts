import { describe, expect, it } from "vitest";
import { cleanDisplayText } from "./display-text";

describe("cleanDisplayText", () => {
  it("decodes common and numeric HTML entities", () => {
    expect(cleanDisplayText("Lead =&gt; Estimate &#38; follow-up")).toBe(
      "Lead => Estimate & follow-up"
    );
  });

  it("strips tags and normalizes whitespace", () => {
    expect(cleanDisplayText("<p>Called <strong>homeowner</strong></p>")).toBe(
      "Called homeowner"
    );
  });
});
