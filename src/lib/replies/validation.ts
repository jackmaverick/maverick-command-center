import { z } from "zod";

export const replyRequestSchema = z.object({
  idempotencyKey: z.string().min(16).max(200),
  workspace: z.string().min(1).max(100),
  contactJnid: z.string().min(1).max(200),
  jobJnid: z.string().max(200).nullable().optional(),
  channel: z.enum(["text", "email", "note"]),
  messageMode: z.enum(["reply", "new"]).optional(),
  body: z.string().trim().min(1).max(10_000),
  subject: z.string().max(500).nullable().optional(),
  fromAddress: z.string().max(500).nullable().optional(),
  toAddresses: z.array(z.string().email()).max(50).optional(),
  ccAddresses: z.array(z.string().email()).max(50).optional(),
  providerContext: z.record(z.string(), z.unknown()).optional(),
});
