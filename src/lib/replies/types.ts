export type ReplyChannel = "text" | "email" | "note";
export type ReplyStatus =
  | "pending"
  | "queued"
  | "sending"
  | "delivered"
  | "failed"
  | "cancelled";

export interface ReplyRequest {
  idempotencyKey: string;
  workspace: string;
  contactJnid: string;
  jobJnid?: string | null;
  channel: ReplyChannel;
  messageMode?: "reply" | "new";
  body: string;
  subject?: string | null;
  fromAddress?: string | null;
  toAddresses?: string[];
  ccAddresses?: string[];
  providerContext?: Record<string, unknown>;
}

export interface OutboundMessage {
  id: string;
  idempotencyKey: string;
  workspace: string;
  contactJnid: string;
  jobJnid: string | null;
  channel: ReplyChannel;
  messageMode: "reply" | "new";
  status: ReplyStatus;
  fromAddress: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  body: string;
  providerThreadId: string | null;
  providerMessageId: string | null;
  providerContext: Record<string, unknown>;
  scheduledFor: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  attemptCount: number;
  createdByEmail: string;
  createdAt: string;
}

export interface ProviderSendResult {
  providerMessageId: string;
  providerThreadId?: string | null;
  status: "delivered" | "pending";
}

export interface ReplyProviders {
  sendText(message: OutboundMessage): Promise<ProviderSendResult>;
  sendEmail(message: OutboundMessage): Promise<ProviderSendResult>;
  createJobNimbusNote(message: OutboundMessage): Promise<ProviderSendResult>;
}
