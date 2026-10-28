import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "./timeline";
import { mergeTimelineEntries } from "./timeline";

function entry(
  id: string,
  source: string,
  occurredAt: string
): TimelineEntry {
  return {
    id,
    source,
    channel: source,
    direction: null,
    line: null,
    occurredAt,
    preview: id,
    body: null,
    matchType: "direct",
  };
}

describe("timeline merge", () => {
  it("merges sources newest first with a stable limit", () => {
    const merged = mergeTimelineEntries(
      [
        [entry("sms-1", "sms", "2026-01-01T12:00:00Z")],
        [
          entry("call-1", "call", "2026-01-02T12:00:00Z"),
          entry("call-2", "call", "2025-12-30T12:00:00Z"),
        ],
      ],
      2
    );

    expect(merged.map(({ id }) => id)).toEqual(["call-1", "sms-1"]);
  });

  it("deduplicates repeated source rows", () => {
    const duplicate = entry("same", "email", "2026-01-01T12:00:00Z");
    expect(mergeTimelineEntries([[duplicate], [duplicate]])).toHaveLength(1);
  });
});
