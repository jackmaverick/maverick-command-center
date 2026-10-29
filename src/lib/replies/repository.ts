import type { PoolClient } from "pg";
import { getPool, query, queryOne } from "@/lib/db";
import type {
  OutboundMessage,
  ReplyChannel,
  ReplyRequest,
  ReplyStatus,
} from "./types";

interface OutboundRow {
  id: string;
  idempotency_key: string;
  workspace: string;
  contact_jnid: string;
  job_jnid: string | null;
  channel: ReplyChannel;
  message_mode: "reply" | "new";
  status: ReplyStatus;
  from_address: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body: string;
  provider_thread_id: string | null;
  provider_message_id: string | null;
  provider_context: Record<string, unknown>;
  scheduled_for: string | null;
  failure_code: string | null;
  failure_message: string | null;
  attempt_count: number;
  created_by_email: string;
  created_at: string;
}

function mapOutbound(row: OutboundRow): OutboundMessage {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    workspace: row.workspace,
    contactJnid: row.contact_jnid,
    jobJnid: row.job_jnid,
    channel: row.channel,
    messageMode: row.message_mode,
    status: row.status,
    fromAddress: row.from_address,
    toAddresses: row.to_addresses,
    ccAddresses: row.cc_addresses,
    subject: row.subject,
    body: row.body,
    providerThreadId: row.provider_thread_id,
    providerMessageId: row.provider_message_id,
    providerContext: row.provider_context,
    scheduledFor: row.scheduled_for,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    attemptCount: row.attempt_count,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
}

async function insertAudit(
  client: Pick<PoolClient, "query">,
  message: OutboundMessage,
  eventType: string,
  actorEmail: string,
  detail: Record<string, unknown> = {}
) {
  await client.query(
    `INSERT INTO cc_send_audit (
       outbound_message_id, event_type, actor_email, channel,
       from_address, to_addresses, provider_message_id, detail
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      message.id,
      eventType,
      actorEmail,
      message.channel,
      message.fromAddress,
      message.toAddresses,
      message.providerMessageId,
      JSON.stringify(detail),
    ]
  );
}

export async function createOutboundMessage(
  request: ReplyRequest,
  actorEmail: string,
  status: "pending" | "queued",
  scheduledFor: string | null
): Promise<{ message: OutboundMessage; created: boolean }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<OutboundRow>(
      `INSERT INTO cc_outbound_messages (
         idempotency_key, workspace, contact_jnid, job_jnid, channel,
         message_mode, status, from_address, to_addresses, cc_addresses,
         subject, body, provider_thread_id, provider_context,
         scheduled_for, created_by_email
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        request.idempotencyKey,
        request.workspace,
        request.contactJnid,
        request.jobJnid ?? null,
        request.channel,
        request.messageMode ?? "reply",
        status,
        request.fromAddress ?? null,
        request.toAddresses ?? [],
        request.ccAddresses ?? [],
        request.subject ?? null,
        request.body,
        typeof request.providerContext?.threadId === "string"
          ? request.providerContext.threadId
          : null,
        JSON.stringify(request.providerContext ?? {}),
        scheduledFor,
        actorEmail,
      ]
    );

    let row = inserted.rows[0];
    const created = Boolean(row);
    if (!row) {
      const existing = await client.query<OutboundRow>(
        `SELECT * FROM cc_outbound_messages WHERE idempotency_key = $1`,
        [request.idempotencyKey]
      );
      row = existing.rows[0];
    }
    if (!row) throw new Error("Idempotent outbound row could not be resolved");
    const message = mapOutbound(row);
    if (created) {
      await insertAudit(
        client,
        message,
        status === "queued" ? "queued" : "created",
        actorEmail,
        scheduledFor ? { scheduledFor } : {}
      );
    }
    await client.query("COMMIT");
    return { message, created };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateOutboundStatus(
  id: string,
  actorEmail: string,
  status: "pending" | "sending" | "delivered" | "failed",
  values: {
    providerMessageId?: string | null;
    providerThreadId?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
  } = {}
): Promise<OutboundMessage | null> {
  const row = await queryOne<OutboundRow>(
    `UPDATE cc_outbound_messages
     SET status = $2,
         provider_message_id = COALESCE($3, provider_message_id),
         provider_thread_id = COALESCE($4, provider_thread_id),
         failure_code = $5,
         failure_message = $6,
         sent_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE sent_at END,
         delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
         failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END,
         attempt_count = CASE WHEN $2 = 'sending' THEN attempt_count + 1 ELSE attempt_count END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      status,
      values.providerMessageId ?? null,
      values.providerThreadId ?? null,
      values.failureCode ?? null,
      values.failureMessage ?? null,
    ]
  );
  if (!row) return null;
  const message = mapOutbound(row);
  await query(
    `INSERT INTO cc_send_audit (
       outbound_message_id, event_type, actor_email, channel,
       from_address, to_addresses, provider_message_id, detail
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      message.id,
      status,
      actorEmail,
      message.channel,
      message.fromAddress,
      message.toAddresses,
      message.providerMessageId,
      JSON.stringify({
        failureCode: message.failureCode,
        failureMessage: message.failureMessage,
      }),
    ]
  );
  return message;
}

export async function recordProviderAccepted(
  id: string,
  providerMessageId: string,
  providerThreadId: string | null,
  actorEmail: string
): Promise<OutboundMessage | null> {
  const row = await queryOne<OutboundRow>(
    `UPDATE cc_outbound_messages
     SET status = 'pending',
         provider_message_id = $2,
         provider_thread_id = COALESCE($3, provider_thread_id),
         sent_at = NOW(),
         failure_code = NULL,
         failure_message = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, providerMessageId, providerThreadId]
  );
  if (!row) return null;
  const message = mapOutbound(row);
  await query(
    `INSERT INTO cc_send_audit (
       outbound_message_id, event_type, actor_email, channel,
       from_address, to_addresses, provider_message_id, detail
     ) VALUES ($1, 'sending', $2, $3, $4, $5, $6, $7)`,
    [
      message.id,
      actorEmail,
      message.channel,
      message.fromAddress,
      message.toAddresses,
      providerMessageId,
      JSON.stringify({ providerStatus: "pending" }),
    ]
  );
  return message;
}

export async function getOutboundMessage(
  id: string
): Promise<OutboundMessage | null> {
  const row = await queryOne<OutboundRow>(
    `SELECT * FROM cc_outbound_messages WHERE id = $1`,
    [id]
  );
  return row ? mapOutbound(row) : null;
}

export async function claimDueMessages(limit = 25): Promise<OutboundMessage[]> {
  const rows = await query<OutboundRow>(
    `WITH due AS (
       SELECT id
       FROM cc_outbound_messages
       WHERE status = 'queued' AND scheduled_for <= NOW()
       ORDER BY scheduled_for, id
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE cc_outbound_messages outbound
     SET status = 'pending', updated_at = NOW()
     FROM due
     WHERE outbound.id = due.id
     RETURNING outbound.*`,
    [limit]
  );
  return rows.map(mapOutbound);
}

export async function cancelQueuedMessage(
  id: string,
  actorEmail: string
): Promise<OutboundMessage | null> {
  const row = await queryOne<OutboundRow>(
    `UPDATE cc_outbound_messages
     SET status = 'cancelled', cancelled_at = NOW(),
         cancelled_by_email = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'queued'
     RETURNING *`,
    [id, actorEmail]
  );
  if (!row) return null;
  const message = mapOutbound(row);
  await query(
    `INSERT INTO cc_send_audit (
       outbound_message_id, event_type, actor_email, channel,
       from_address, to_addresses, detail
     ) VALUES ($1, 'cancelled', $2, $3, $4, $5, '{}'::jsonb)`,
    [
      message.id,
      actorEmail,
      message.channel,
      message.fromAddress,
      message.toAddresses,
    ]
  );
  return message;
}

export async function queueOutboundMessage(
  id: string,
  scheduledFor: string,
  actorEmail: string
): Promise<OutboundMessage | null> {
  const row = await queryOne<OutboundRow>(
    `UPDATE cc_outbound_messages
     SET status = 'queued', scheduled_for = $2,
         failure_code = NULL, failure_message = NULL, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'failed')
     RETURNING *`,
    [id, scheduledFor]
  );
  if (!row) return null;
  const message = mapOutbound(row);
  await query(
    `INSERT INTO cc_send_audit (
       outbound_message_id, event_type, actor_email, channel,
       from_address, to_addresses, detail
     ) VALUES ($1, 'queued', $2, $3, $4, $5, $6)`,
    [
      message.id,
      actorEmail,
      message.channel,
      message.fromAddress,
      message.toAddresses,
      JSON.stringify({ scheduledFor }),
    ]
  );
  return message;
}

export async function listContactOutbound(
  contactJnid: string
): Promise<OutboundMessage[]> {
  const rows = await query<OutboundRow>(
    `SELECT *
     FROM cc_outbound_messages
     WHERE contact_jnid = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [contactJnid]
  );
  return rows.map(mapOutbound);
}

export async function saveDraft(
  request: ReplyRequest,
  actorEmail: string
) {
  return queryOne(
    `INSERT INTO cc_drafts (
       workspace, contact_jnid, job_jnid, channel, message_mode,
       from_address, to_addresses, cc_addresses, subject, body,
       provider_context, created_by_email
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (workspace, contact_jnid, channel, created_by_email)
     DO UPDATE SET
       job_jnid = EXCLUDED.job_jnid,
       message_mode = EXCLUDED.message_mode,
       from_address = EXCLUDED.from_address,
       to_addresses = EXCLUDED.to_addresses,
       cc_addresses = EXCLUDED.cc_addresses,
       subject = EXCLUDED.subject,
       body = EXCLUDED.body,
       provider_context = EXCLUDED.provider_context,
       updated_at = NOW()
     RETURNING *`,
    [
      request.workspace,
      request.contactJnid,
      request.jobJnid ?? null,
      request.channel,
      request.messageMode ?? "reply",
      request.fromAddress ?? null,
      request.toAddresses ?? [],
      request.ccAddresses ?? [],
      request.subject ?? null,
      request.body,
      JSON.stringify(request.providerContext ?? {}),
      actorEmail,
    ]
  );
}

export async function getDrafts(contactJnid: string, actorEmail: string) {
  return query(
    `SELECT * FROM cc_drafts
     WHERE contact_jnid = $1 AND created_by_email = $2
     ORDER BY updated_at DESC`,
    [contactJnid, actorEmail]
  );
}

export async function deleteDraft(
  contactJnid: string,
  channel: ReplyChannel,
  actorEmail: string
) {
  await query(
    `DELETE FROM cc_drafts
     WHERE contact_jnid = $1 AND channel = $2 AND created_by_email = $3`,
    [contactJnid, channel, actorEmail]
  );
}
