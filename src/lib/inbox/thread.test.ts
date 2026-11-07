import { describe, expect, it } from "vitest";
import { includeThreadTimelineEvent } from "./thread";

describe("inbox thread activity filtering", () => {
  it("keeps communication and status events", () => {
    for (const channel of [
      "note",
      "email",
      "text_message",
      "sms",
      "status_changed",
    ]) {
      expect(
        includeThreadTimelineEvent({ source: "activities", channel })
      ).toBe(true);
    }
  });

  it("removes non-communication JobNimbus activity", () => {
    for (const channel of [
      "contact_created",
      "related_to_job",
      "job_created",
      "estimate_created",
      "task_created",
    ]) {
      expect(
        includeThreadTimelineEvent({ source: "activities", channel })
      ).toBe(false);
    }
  });

  it("keeps communication records from first-party channel tables", () => {
    expect(
      includeThreadTimelineEvent({ source: "sms_messages", channel: "SMS" })
    ).toBe(true);
    expect(
      includeThreadTimelineEvent({ source: "calls", channel: "Call" })
    ).toBe(true);
  });
});
