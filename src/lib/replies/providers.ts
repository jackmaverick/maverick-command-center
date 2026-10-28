import { JWT } from "google-auth-library";
import { jnRequest } from "@/lib/jobnimbus";
import type {
  OutboundMessage,
  ProviderSendResult,
  ReplyProviders,
} from "./types";

function providerError(provider: string, status: number, body: string): Error {
  const error = new Error(`${provider} request failed (${status})`);
  Object.assign(error, {
    code: `${provider.toUpperCase()}_${status}`,
    providerBody: body.slice(0, 500),
  });
  return error;
}

export async function sendOpenPhoneText(
  message: OutboundMessage
): Promise<ProviderSendResult> {
  const apiKey = process.env.OPENPHONE_API_KEY;
  if (!apiKey) throw new Error("OPENPHONE_API_KEY is not configured");
  if (!message.fromAddress || !message.toAddresses[0]) {
    throw new Error("OpenPhone sender and recipient are required");
  }
  const response = await fetch("https://api.openphone.com/v1/messages", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: message.body,
      from: message.fromAddress,
      to: [message.toAddresses[0]],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw providerError("openphone", response.status, raw);
  const payload = JSON.parse(raw) as {
    data?: { id?: string };
    id?: string;
  };
  const providerMessageId = payload.data?.id ?? payload.id;
  if (!providerMessageId) {
    throw new Error("OpenPhone response did not include a message id");
  }
  return { providerMessageId, status: "pending" };
}

function googleCredentials(): {
  email: string;
  key: string;
  clientId: string | null;
} {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const parsed = JSON.parse(json) as {
      client_email?: string;
      private_key?: string;
      client_id?: string;
    };
    if (parsed.client_email && parsed.private_key) {
      return {
        email: parsed.client_email,
        key: parsed.private_key.replace(/\\n/g, "\n"),
        clientId: parsed.client_id ?? null,
      };
    }
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error("Google service-account credentials are not configured");
  }
  return {
    email,
    key: key.replace(/\\n/g, "\n"),
    clientId: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID ?? null,
  };
}

async function gmailToken(mailbox: string): Promise<string> {
  const credentials = googleCredentials();
  const client = new JWT({
    email: credentials.email,
    key: credentials.key,
    subject: mailbox,
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain delegated Gmail token");
  return token;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendGmailMessage(
  message: OutboundMessage
): Promise<ProviderSendResult> {
  const mailbox = message.fromAddress;
  if (!mailbox) throw new Error("Gmail sender mailbox is required");
  const token = await gmailToken(mailbox);
  let inReplyTo: string | null = null;
  let references: string | null = null;
  const gmailMessageId =
    typeof message.providerContext.gmailMessageId === "string"
      ? message.providerContext.gmailMessageId
      : null;

  if (message.messageMode === "reply" && gmailMessageId) {
    const metadataResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const raw = await metadataResponse.text();
    if (!metadataResponse.ok) {
      throw providerError("gmail", metadataResponse.status, raw);
    }
    const metadata = JSON.parse(raw) as {
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const headers = metadata.payload?.headers ?? [];
    inReplyTo =
      headers.find((header) => header.name.toLowerCase() === "message-id")
        ?.value ??
      (typeof message.providerContext.internetMessageId === "string"
        ? message.providerContext.internetMessageId
        : null);
    references =
      headers.find((header) => header.name.toLowerCase() === "references")
        ?.value ?? inReplyTo;
  }

  const headers = [
    `From: ${cleanHeader(mailbox)}`,
    `To: ${message.toAddresses.map(cleanHeader).join(", ")}`,
    ...(message.ccAddresses.length
      ? [`Cc: ${message.ccAddresses.map(cleanHeader).join(", ")}`]
      : []),
    `Subject: ${cleanHeader(message.subject ?? "")}`,
    ...(inReplyTo ? [`In-Reply-To: ${cleanHeader(inReplyTo)}`] : []),
    ...(references ? [`References: ${cleanHeader(references)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    message.body,
  ];
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: base64Url(headers.join("\r\n")),
        ...(message.providerThreadId
          ? { threadId: message.providerThreadId }
          : {}),
      }),
    }
  );
  const raw = await response.text();
  if (!response.ok) throw providerError("gmail", response.status, raw);
  const payload = JSON.parse(raw) as { id?: string; threadId?: string };
  if (!payload.id) throw new Error("Gmail response did not include a message id");
  return {
    providerMessageId: payload.id,
    providerThreadId: payload.threadId ?? message.providerThreadId,
    status: "delivered",
  };
}

export async function createJobNimbusNote(
  message: OutboundMessage
): Promise<ProviderSendResult> {
  if (!message.jobJnid && !message.contactJnid) {
    throw new Error("A JobNimbus job or contact is required for a note");
  }
  const result = await jnRequest<{ jnid?: string; id?: string }>(
    "/activities",
    {
      method: "POST",
      body: {
        activity_type_code: "note",
        content: message.body,
        subject: "Command Center internal note",
        job_jnid: message.jobJnid,
        contact_jnid: message.contactJnid,
        metadata: {
          source: "maverick-command-center",
          actor_email: message.createdByEmail,
        },
      },
    }
  );
  const providerMessageId = result.jnid ?? result.id;
  if (!providerMessageId) {
    throw new Error("JobNimbus response did not include an activity id");
  }
  return { providerMessageId, status: "delivered" };
}

export const liveReplyProviders: ReplyProviders = {
  sendText: sendOpenPhoneText,
  sendEmail: sendGmailMessage,
  createJobNimbusNote,
};

export function getGoogleServiceAccountClientId(): string | null {
  try {
    return googleCredentials().clientId;
  } catch {
    return null;
  }
}
