import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "./timeline";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
  mergeTimelineEntries,
} from "./timeline";

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
    deliveryStatus: null,
    durationSeconds: null,
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

  it("round-trips a composite pagination cursor", () => {
    const cursor = {
      occurredAt: "2026-01-01T12:00:00.000Z",
      source: "sms_messages",
      id: "message-2",
    };
    expect(decodeTimelineCursor(encodeTimelineCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors", () => {
    expect(decodeTimelineCursor("not-a-cursor")).toBeNull();
    expect(
      decodeTimelineCursor(
        Buffer.from(
          JSON.stringify({ occurredAt: "not-a-date", source: "sms", id: "1" })
        ).toString("base64url")
      )
    ).toBeNull();
  });
});
