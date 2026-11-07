import { describe, expect, it } from "vitest";
import {
  isUnresponded,
  type InboxDatabaseRow,
} from "./repository";

function row(overrides: Partial<InboxDatabaseRow>): InboxDatabaseRow {
  return {
    contact_jnid: "contact",
    job_jnid: "job",
    name: "Homeowner",
    street: null,
    phone: null,
    email: null,
    status: "Lead",
    status_order: 1,
    sales_rep: null,
    campaign: null,
    last_at: new Date().toISOString(),
    preview: "",
    channel: "SMS",
    direction: "outgoing",
    line: null,
    sender: null,
    event_status: null,
    is_voicemail: false,
    duration_seconds: null,
    automated: false,
    ...overrides,
  };
}

describe("computed conversation attention", () => {
  it("flags inbound texts and voicemail", () => {
    expect(isUnresponded(row({ direction: "incoming" }))).toBe(true);
    expect(
      isUnresponded(
        row({
          channel: "Call",
          direction: "inbound",
          is_voicemail: true,
        })
      )
    ).toBe(true);
  });

  it("flags missed inbound calls and automation responses", () => {
    expect(
      isUnresponded(
        row({
          channel: "Call",
          direction: "inbound",
          event_status: "no-answer",
          duration_seconds: 0,
        })
      )
    ).toBe(true);
    expect(isUnresponded(row({ automated: true }))).toBe(true);
  });

  it("does not flag a completed outbound teammate reply", () => {
    expect(
      isUnresponded(
        row({
          channel: "SMS",
          direction: "outgoing",
          event_status: "delivered",
        })
      )
    ).toBe(false);
  });
});
