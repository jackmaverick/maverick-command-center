import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboundMessage, ReplyProviders, ReplyRequest } from "./types";

const mocks = vi.hoisted(() => ({
  resolveTextContext: vi.fn(),
  resolveEmailContext: vi.fn(),
  createOutboundMessage: vi.fn(),
  updateOutboundStatus: vi.fn(),
  recordProviderAccepted: vi.fn(),
  getOutboundMessage: vi.fn(),
  queueOutboundMessage: vi.fn(),
  claimDueMessages: vi.fn(),
}));

vi.mock("./context", () => ({
  resolveTextContext: mocks.resolveTextContext,
  resolveEmailContext: mocks.resolveEmailContext,
  isAllowedGmailSender: () => true,
}));
vi.mock("./repository", () => ({
  createOutboundMessage: mocks.createOutboundMessage,
  updateOutboundStatus: mocks.updateOutboundStatus,
  recordProviderAccepted: mocks.recordProviderAccepted,
  getOutboundMessage: mocks.getOutboundMessage,
  queueOutboundMessage: mocks.queueOutboundMessage,
  claimDueMessages: mocks.claimDueMessages,
}));

import {
  createReply,
  releaseDueReplies,
  ReplySafetyError,
} from "./service";

const request: ReplyRequest = {
  idempotencyKey: "test-idempotency-key-123",
  workspace: "insurance",
  contactJnid: "contact-1",
  jobJnid: "job-1",
  channel: "text",
  body: "Test reply",
};

function message(status: OutboundMessage["status"]): OutboundMessage {
  return {
    id: "outbound-1",
    idempotencyKey: request.idempotencyKey,
    workspace: request.workspace,
    contactJnid: request.contactJnid,
    jobJnid: request.jobJnid ?? null,
    channel: "text",
    messageMode: "reply",
    status,
    fromAddress: "+19132686052",
    toAddresses: ["+19137876881"],
    ccAddresses: [],
    subject: null,
    body: request.body,
    providerThreadId: null,
    providerMessageId: null,
    providerContext: {},
    scheduledFor: null,
    failureCode: null,
    failureMessage: null,
    attemptCount: 0,
    createdByEmail: "jack@maverickexteriorskc.com",
    createdAt: "2026-10-28T15:00:00Z",
  };
}

const providers: ReplyProviders = {
  sendText: vi.fn().mockResolvedValue({
    providerMessageId: "provider-1",
    status: "pending",
  }),
  sendEmail: vi.fn(),
  createJobNimbusNote: vi.fn(),
};

describe("reply service safety", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    process.env.REPLIES_ENABLED = "true";
    process.env.REPLIES_ALLOWED_EMAILS =
      "jack@maverickexteriorskc.com,michael@maverickexteriorskc.com";
    mocks.resolveTextContext.mockResolvedValue({
      selectedLine: {
        phoneNumberId: "line-1",
        phoneNumber: "+19132686052",
        name: "Maverick Main",
      },
      recipient: "+19137876881",
      lines: [],
      optedOut: false,
      blockedReason: null,
    });
    mocks.updateOutboundStatus.mockResolvedValue(message("sending"));
    mocks.recordProviderAccepted.mockResolvedValue(message("pending"));
  });

  afterEach(() => {
    delete process.env.REPLIES_ENABLED;
    delete process.env.REPLIES_ALLOWED_EMAILS;
  });

  it("never creates or sends when the feature flag is off", async () => {
    process.env.REPLIES_ENABLED = "false";
    await expect(
      createReply(
        request,
        "jack@maverickexteriorskc.com",
        new Date("2026-10-28T15:00:00Z"),
        providers
      )
    ).rejects.toBeInstanceOf(ReplySafetyError);
    expect(mocks.createOutboundMessage).not.toHaveBeenCalled();
    expect(providers.sendText).not.toHaveBeenCalled();
  });

  it("queues homeowner communication outside 8am-7pm CT", async () => {
    const queued = message("queued");
    mocks.createOutboundMessage.mockResolvedValue({
      message: queued,
      created: true,
    });
    const result = await createReply(
      request,
      "jack@maverickexteriorskc.com",
      new Date("2026-10-29T01:00:00Z"),
      providers
    );
    expect(result.status).toBe("queued");
    expect(mocks.createOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAddress: "+19132686052",
        toAddresses: ["+19137876881"],
      }),
      "jack@maverickexteriorskc.com",
      "queued",
      "2026-10-29T13:00:00.000Z"
    );
    expect(providers.sendText).not.toHaveBeenCalled();
  });

  it("blocks opted-out homeowners before creating an outbound row", async () => {
    mocks.resolveTextContext.mockResolvedValue({
      selectedLine: null,
      recipient: "+19137876881",
      lines: [],
      optedOut: true,
      blockedReason: "Text blocked: homeowner opted out with STOP",
    });
    await expect(
      createReply(
        request,
        "jack@maverickexteriorskc.com",
        new Date("2026-10-28T15:00:00Z"),
        providers
      )
    ).rejects.toMatchObject({ code: "SMS_OPTED_OUT" });
    expect(mocks.createOutboundMessage).not.toHaveBeenCalled();
    expect(providers.sendText).not.toHaveBeenCalled();
  });

  it("uses only injected providers during tests", async () => {
    mocks.createOutboundMessage.mockResolvedValue({
      message: message("pending"),
      created: true,
    });
    const result = await createReply(
      request,
      "jack@maverickexteriorskc.com",
      new Date("2026-10-28T15:00:00Z"),
      providers
    );
    expect(providers.sendText).toHaveBeenCalledOnce();
    expect(result.status).toBe("pending");
  });

  it("does not claim or release the queue while replies are disabled", async () => {
    process.env.REPLIES_ENABLED = "false";
    expect(await releaseDueReplies(providers)).toEqual({
      skipped: true,
      processed: 0,
      delivered: 0,
      failed: 0,
    });
    expect(mocks.claimDueMessages).not.toHaveBeenCalled();
    expect(providers.sendText).not.toHaveBeenCalled();
  });

  it("releases due queue entries only through injected providers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T15:00:00Z"));
    mocks.claimDueMessages.mockResolvedValue([message("pending")]);
    const result = await releaseDueReplies(providers);
    expect(result).toEqual({
      skipped: false,
      processed: 1,
      delivered: 1,
      failed: 0,
    });
    expect(providers.sendText).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
