import { getSafeServerError } from "@/lib/server-error";
import { isAllowedGmailSender, resolveEmailContext, resolveTextContext } from "./context";
import {
  createOutboundMessage,
  claimDueMessages,
  getOutboundMessage,
  queueOutboundMessage,
  recordProviderAccepted,
  updateOutboundStatus,
} from "./repository";
import { replyPolicy } from "./policy";
import { liveReplyProviders } from "./providers";
import type {
  OutboundMessage,
  ReplyProviders,
  ReplyRequest,
} from "./types";

export class ReplySafetyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 403
  ) {
    super(message);
  }
}

async function resolveRequest(
  request: ReplyRequest
): Promise<ReplyRequest> {
  if (request.channel === "text") {
    const context = await resolveTextContext(
      request.contactJnid,
      request.jobJnid ?? null,
      true
    );
    if (context.blockedReason) {
      throw new ReplySafetyError(
        context.blockedReason,
        context.optedOut ? "SMS_OPTED_OUT" : "SMS_RECIPIENT_MISSING",
        409
      );
    }
    const selected =
      context.lines.find(
        (line) =>
          line.phoneNumberId === request.providerContext?.phoneNumberId ||
          line.phoneNumber === request.fromAddress
      ) ??
      context.selectedLine ??
      null;
    if (!selected) {
      throw new ReplySafetyError(
        "Select an active OpenPhone line before sending",
        "OPENPHONE_LINE_REQUIRED",
        409
      );
    }
    return {
      ...request,
      fromAddress: selected.phoneNumber,
      toAddresses: context.recipient ? [context.recipient] : [],
      providerContext: {
        ...(request.providerContext ?? {}),
        phoneNumberId: selected.phoneNumberId,
      },
    };
  }

  if (request.channel === "email") {
    const context = await resolveEmailContext(
      request.contactJnid,
      request.jobJnid ?? null
    );
    if ((request.messageMode ?? "reply") === "reply") {
      if (!context.reply) {
        throw new ReplySafetyError(
          "No Gmail thread is available; start a new email instead",
          "GMAIL_THREAD_MISSING",
          409
        );
      }
      if (context.reply.blockedReason) {
        throw new ReplySafetyError(
          context.reply.blockedReason,
          "GMAIL_MAILBOX_BLOCKED",
          409
        );
      }
      return {
        ...request,
        messageMode: "reply",
        fromAddress: context.reply.mailbox,
        toAddresses: context.reply.to,
        ccAddresses: context.reply.cc,
        subject: context.reply.subject,
        providerContext: {
          ...(request.providerContext ?? {}),
          threadId: context.reply.threadId,
          gmailMessageId: context.reply.gmailMessageId,
          internetMessageId: context.reply.internetMessageId,
        },
      };
    }
    const fromAddress =
      request.fromAddress ?? context.newEmail.defaultFrom;
    if (!isAllowedGmailSender(fromAddress)) {
      throw new ReplySafetyError(
        "Select an approved Maverick Gmail inbox",
        "GMAIL_MAILBOX_BLOCKED",
        409
      );
    }
    if (!request.toAddresses?.length) {
      throw new ReplySafetyError(
        "A homeowner email address is required",
        "EMAIL_RECIPIENT_MISSING",
        400
      );
    }
    return {
      ...request,
      messageMode: "new",
      fromAddress,
      subject: request.subject?.trim() || "Message from Maverick Exteriors",
    };
  }

  if (!request.jobJnid) {
    throw new ReplySafetyError(
      "A JobNimbus job is required for an internal note",
      "JOBNIMBUS_JOB_REQUIRED",
      409
    );
  }
  return request;
}

export async function dispatchOutbound(
  message: OutboundMessage,
  actorEmail: string,
  providers: ReplyProviders = liveReplyProviders
): Promise<OutboundMessage> {
  await updateOutboundStatus(message.id, actorEmail, "sending");
  try {
    const result =
      message.channel === "text"
        ? await providers.sendText(message)
        : message.channel === "email"
          ? await providers.sendEmail(message)
          : await providers.createJobNimbusNote(message);
    const updated =
      result.status === "pending"
        ? await recordProviderAccepted(
            message.id,
            result.providerMessageId,
            result.providerThreadId ?? null,
            actorEmail
          )
        : await updateOutboundStatus(message.id, actorEmail, "delivered", {
            providerMessageId: result.providerMessageId,
            providerThreadId: result.providerThreadId ?? null,
          });
    if (!updated) throw new Error("Outbound row disappeared after provider send");
    return updated;
  } catch (error) {
    const safe = getSafeServerError(error);
    await updateOutboundStatus(message.id, actorEmail, "failed", {
      failureCode: safe.code ?? "PROVIDER_ERROR",
      failureMessage: safe.message,
    });
    throw error;
  }
}

export async function createReply(
  request: ReplyRequest,
  actorEmail: string,
  now = new Date(),
  providers: ReplyProviders = liveReplyProviders
) {
  const policy = replyPolicy(actorEmail, request.channel, now);
  if (!policy.canCompose) {
    throw new ReplySafetyError(
      policy.reason ?? "Reply is not allowed",
      "REPLIES_NOT_ALLOWED"
    );
  }
  const resolved = await resolveRequest(request);
  const queueFor =
    resolved.channel === "note" || policy.sendNow ? null : policy.queueFor;
  const { message, created } = await createOutboundMessage(
    resolved,
    actorEmail,
    queueFor ? "queued" : "pending",
    queueFor
  );
  if (!created || message.status === "queued") {
    return message;
  }
  return dispatchOutbound(message, actorEmail, providers);
}

export async function retryReply(
  id: string,
  actorEmail: string,
  providers: ReplyProviders = liveReplyProviders
) {
  const message = await getOutboundMessage(id);
  if (!message) {
    throw new ReplySafetyError("Reply not found", "REPLY_NOT_FOUND", 404);
  }
  const policy = replyPolicy(actorEmail, message.channel);
  if (!policy.canCompose) {
    throw new ReplySafetyError(
      policy.reason ?? "Retry is not allowed",
      "REPLIES_NOT_ALLOWED"
    );
  }
  if (message.status !== "failed") {
    throw new ReplySafetyError(
      "Only failed replies can be retried",
      "RETRY_NOT_FAILED",
      409
    );
  }
  if (message.channel === "text") {
    const context = await resolveTextContext(
      message.contactJnid,
      message.jobJnid,
      true
    );
    if (context.blockedReason) {
      throw new ReplySafetyError(
        context.blockedReason,
        context.optedOut ? "SMS_OPTED_OUT" : "SMS_RECIPIENT_MISSING",
        409
      );
    }
  }
  if (!policy.sendNow && message.channel !== "note" && policy.queueFor) {
    const queued = await queueOutboundMessage(
      message.id,
      policy.queueFor,
      actorEmail
    );
    if (!queued) {
      throw new ReplySafetyError(
        "Reply could not be queued",
        "QUEUE_FAILED",
        409
      );
    }
    return queued;
  }
  return dispatchOutbound(message, actorEmail, providers);
}

export async function releaseDueReplies(
  providers: ReplyProviders = liveReplyProviders
) {
  if (process.env.REPLIES_ENABLED?.trim().toLowerCase() !== "true") {
    return { skipped: true, processed: 0, delivered: 0, failed: 0 };
  }
  const due = await claimDueMessages();
  let delivered = 0;
  let failed = 0;
  for (const message of due) {
    const policy = replyPolicy(message.createdByEmail, message.channel);
    if (!policy.sendNow) {
      if (policy.queueFor) {
        await queueOutboundMessage(
          message.id,
          policy.queueFor,
          message.createdByEmail
        );
      }
      continue;
    }
    try {
      await dispatchOutbound(
        message,
        message.createdByEmail,
        providers
      );
      delivered += 1;
    } catch {
      failed += 1;
    }
  }
  return {
    skipped: false,
    processed: due.length,
    delivered,
    failed,
  };
}
