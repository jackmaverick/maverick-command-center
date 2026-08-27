import { describe, expect, it } from "vitest";

import { formatDirectMailDate } from "./format";

describe("formatDirectMailDate", () => {
  it("renders a PostgreSQL DATE as the same local calendar day", () => {
    expect(formatDirectMailDate("2026-08-27")).toBe("Aug 27, 2026");
  });

  it("preserves the not-proven label for missing evidence", () => {
    expect(formatDirectMailDate(null)).toBe("Not proven");
  });
});
