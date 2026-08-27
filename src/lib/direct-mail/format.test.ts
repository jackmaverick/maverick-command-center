import { describe, expect, it } from "vitest";

import { formatDirectMailDate, isDirectMailProvenStatus } from "./format";

describe("formatDirectMailDate", () => {
  it("renders a PostgreSQL DATE as the same local calendar day", () => {
    expect(formatDirectMailDate("2026-08-27")).toBe("Aug 27, 2026");
  });

  it("preserves the not-proven label for missing evidence", () => {
    expect(formatDirectMailDate(null)).toBe("Not proven");
  });

  it.each(["postal_confirmed", "postal_drop_confirmed", "complete"])(
    "treats %s as a proven status",
    (status) => {
      expect(isDirectMailProvenStatus(status, 1)).toBe(true);
    },
  );

  it("does not treat preparation or acceptance as postal proof", () => {
    expect(isDirectMailProvenStatus("package_ready", 1)).toBe(false);
    expect(isDirectMailProvenStatus("vendor_confirmed", 1)).toBe(false);
  });

  it("does not treat a terminal label as proof without confirmed recipients", () => {
    expect(isDirectMailProvenStatus("complete", 0)).toBe(false);
    expect(isDirectMailProvenStatus("postal_drop_confirmed", 0)).toBe(false);
  });
});
