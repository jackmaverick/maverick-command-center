import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, queryOne } = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query, queryOne }));

import { resolveEmailContext } from "./context";

describe("Gmail reply context", () => {
  beforeEach(() => {
    query.mockReset();
    queryOne.mockReset();
  });

  it("replies to the inbound sender and preserves reply-all CC without our mailbox", async () => {
    queryOne
      .mockResolvedValueOnce({
        gmail_message_id: "gmail-1",
        gmail_thread_id: "thread-1",
        internet_message_id: "<message@example.com>",
        monitored_mailbox: "info@maverickexteriorskc.com",
        subject: "Roof question",
        from_email: "homeowner@example.com",
        to_recipients: [
          { email: "info@maverickexteriorskc.com" },
          { email: "adjuster@example.com" },
        ],
        cc_recipients: [
          { email: "adjuster@example.com" },
          { email: "jack@maverickexteriorskc.com" },
        ],
        direction: "inbound",
      })
      .mockResolvedValueOnce({ email: "homeowner@example.com" });

    const context = await resolveEmailContext("contact-1", "job-1");

    expect(context.reply).toMatchObject({
      mailbox: "info@maverickexteriorskc.com",
      subject: "Re: Roof question",
      to: ["homeowner@example.com"],
      cc: ["adjuster@example.com"],
      blockedReason: null,
    });
    expect(context.newEmail.to).toEqual(["homeowner@example.com"]);
  });

  it("blocks replies from an unapproved monitored mailbox", async () => {
    queryOne
      .mockResolvedValueOnce({
        gmail_message_id: "gmail-2",
        gmail_thread_id: "thread-2",
        internet_message_id: null,
        monitored_mailbox: "bob@maverickexteriorskc.com",
        subject: "Question",
        from_email: "homeowner@example.com",
        to_recipients: [],
        cc_recipients: [],
        direction: "inbound",
      })
      .mockResolvedValueOnce({ email: "homeowner@example.com" });

    const context = await resolveEmailContext("contact-1", null);
    expect(context.reply?.blockedReason).toContain(
      "bob@maverickexteriorskc.com"
    );
  });
});
