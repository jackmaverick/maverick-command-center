import { query, queryOne } from "@/lib/db";

const ALLOWED_GMAIL_SENDERS = [
  "jack@maverickexteriorskc.com",
  "info@maverickexteriorskc.com",
  "michael@maverickexteriorskc.com",
] as const;
const STOP_PATTERN =
  /^\s*(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)(?:\s|$)/i;

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value.startsWith("+") ? value : null;
}

interface SmsContextRow {
  id: string;
  contact_jnid: string | null;
  job_jnid: string | null;
  direction: string;
  from_number: string | null;
  to_numbers: string[];
  phone_number_id: string | null;
  message_text: string | null;
  sent_at: string;
  line_number: string | null;
  line_name: string | null;
  line_active: boolean | null;
}

export async function resolveTextContext(
  contactJnid: string,
  jobJnid: string | null,
  recordDetectedOptOut = false
) {
  const [latest, incomingStop, existingOptOut, syncedConsent, activeLines] = await Promise.all([
    queryOne<SmsContextRow>(
      `SELECT
         sms.id, sms.contact_jnid, sms.job_jnid, sms.direction,
         sms.from_number, sms.to_numbers, sms.phone_number_id,
         sms.message_text, sms.sent_at,
         line.phone_number AS line_number,
         line.name AS line_name,
         line.is_active AS line_active
       FROM sms_messages sms
       LEFT JOIN openphone_phone_numbers line
         ON line.phone_number_id = sms.phone_number_id
       WHERE sms.deleted_at IS NULL
         AND (sms.contact_jnid = $1 OR ($2::text IS NOT NULL AND sms.job_jnid = $2))
       ORDER BY sms.sent_at DESC
       LIMIT 1`,
      [contactJnid, jobJnid]
    ),
    queryOne<{
      id: string;
      from_number: string;
      message_text: string;
      sent_at: string;
    }>(
      `SELECT id, from_number, message_text, sent_at
       FROM sms_messages
       WHERE deleted_at IS NULL
         AND direction = 'incoming'
         AND (contact_jnid = $1 OR ($2::text IS NOT NULL AND job_jnid = $2))
         AND message_text ~* '^\\s*(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)(\\s|$)'
       ORDER BY sent_at DESC
       LIMIT 1`,
      [contactJnid, jobJnid]
    ),
    queryOne<{ phone_e164: string; keyword: string; opted_out_at: string }>(
      `SELECT phone_e164, keyword, opted_out_at
       FROM cc_sms_opt_outs
       WHERE contact_jnid = $1
       ORDER BY opted_out_at DESC
       LIMIT 1`,
      [contactJnid]
    ),
    queryOne<{ phone_number: string | null; opt_out_reason: string | null }>(
      `SELECT phone_number, opt_out_reason
       FROM sms_consent
       WHERE contact_jnid = $1
         AND (opt_out_at IS NOT NULL OR COALESCE(is_active, true) = false)
       ORDER BY opt_out_at DESC NULLS LAST
       LIMIT 1`,
      [contactJnid]
    ),
    query<{
      phone_number_id: string;
      phone_number: string;
      name: string | null;
    }>(
      `SELECT phone_number_id, phone_number, name
       FROM openphone_phone_numbers
       WHERE COALESCE(is_active, true) = true
       ORDER BY name NULLS LAST, phone_number`,
      []
    ),
  ]);

  let recordedOptOut = existingOptOut;
  if (recordDetectedOptOut && incomingStop && !existingOptOut) {
    const phone = normalizePhone(incomingStop.from_number);
    const keyword =
      incomingStop.message_text.match(STOP_PATTERN)?.[1]?.toUpperCase() ??
      "STOP";
    if (phone) {
      recordedOptOut = await queryOne(
        `INSERT INTO cc_sms_opt_outs (
           contact_jnid, phone_e164, keyword, source_sms_message_id,
           opted_out_at, detail
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (phone_e164) DO UPDATE SET
           contact_jnid = COALESCE(EXCLUDED.contact_jnid, cc_sms_opt_outs.contact_jnid),
           keyword = EXCLUDED.keyword,
           source_sms_message_id = EXCLUDED.source_sms_message_id,
           opted_out_at = GREATEST(cc_sms_opt_outs.opted_out_at, EXCLUDED.opted_out_at)
         RETURNING phone_e164, keyword, opted_out_at`,
        [
          contactJnid,
          phone,
          keyword,
          incomingStop.id,
          incomingStop.sent_at,
          JSON.stringify({ source: "incoming_sms" }),
        ]
      );
    }
  }

  const fromNumber =
    normalizePhone(latest?.line_number) ??
    normalizePhone(
      latest?.direction === "incoming"
        ? latest.to_numbers?.[0]
        : latest?.from_number
    );
  const toNumber = normalizePhone(
    latest?.direction === "incoming"
      ? latest.from_number
      : latest?.to_numbers?.[0]
  );
  const selectedLine =
    latest?.phone_number_id && fromNumber && latest.line_active !== false
      ? {
          phoneNumberId: latest.phone_number_id,
          phoneNumber: fromNumber,
          name: latest.line_name,
        }
      : null;

  return {
    selectedLine,
    recipient: toNumber,
    lines: activeLines.map((line) => ({
      phoneNumberId: line.phone_number_id,
      phoneNumber: normalizePhone(line.phone_number) ?? line.phone_number,
      name: line.name,
    })),
    optedOut: Boolean(recordedOptOut || incomingStop || syncedConsent),
    blockedReason:
      recordedOptOut || incomingStop || syncedConsent
        ? `Text blocked: homeowner opted out with ${recordedOptOut?.keyword ?? incomingStop?.message_text ?? syncedConsent?.opt_out_reason ?? "STOP"}`
        : !toNumber
          ? "Text blocked: no homeowner mobile number resolved"
          : null,
  };
}

interface EmailContextRow {
  gmail_message_id: string;
  gmail_thread_id: string;
  internet_message_id: string | null;
  monitored_mailbox: string;
  subject: string | null;
  from_email: string | null;
  to_recipients: unknown;
  cc_recipients: unknown;
  direction: string;
}

function recipientEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        const candidate = entry as { email?: unknown; address?: unknown };
        if (typeof candidate.email === "string") return candidate.email;
        if (typeof candidate.address === "string") return candidate.address;
      }
      return null;
    })
    .filter((email): email is string => Boolean(email))
    .map((email) => email.trim().toLowerCase());
}

export async function resolveEmailContext(
  contactJnid: string,
  jobJnid: string | null
) {
  const [latest, contact] = await Promise.all([
    queryOne<EmailContextRow>(
    `SELECT
       gmail_message_id, gmail_thread_id, internet_message_id,
       monitored_mailbox, subject, from_email, to_recipients, cc_recipients,
       direction
     FROM emails
     WHERE contact_jnid = $1 OR ($2::text IS NOT NULL AND job_jnid = $2)
     ORDER BY COALESCE(sent_at, received_at, created_at) DESC
     LIMIT 1`,
      [contactJnid, jobJnid]
    ),
    queryOne<{ email: string | null }>(
      `SELECT email FROM contacts WHERE jnid = $1 AND deleted_at IS NULL`,
      [contactJnid]
    ),
  ]);
  const mailbox = latest?.monitored_mailbox?.toLowerCase() ?? null;
  const allowedMailbox = mailbox
    ? ALLOWED_GMAIL_SENDERS.includes(
        mailbox as (typeof ALLOWED_GMAIL_SENDERS)[number]
      )
    : false;
  const originalTo = recipientEmails(latest?.to_recipients);
  const originalCc = recipientEmails(latest?.cc_recipients);
  const replyTo = new Set(
    latest?.direction === "outbound"
      ? originalTo
      : latest?.from_email
        ? [latest.from_email.toLowerCase()]
        : []
  );
  const replyCc = new Set([
    ...originalCc,
    ...(latest?.direction === "inbound" ? originalTo : []),
  ]);
  for (const ownAddress of ALLOWED_GMAIL_SENDERS) {
    replyTo.delete(ownAddress);
    replyCc.delete(ownAddress);
  }
  for (const address of replyTo) {
    replyCc.delete(address);
  }

  return {
    reply: latest
      ? {
          gmailMessageId: latest.gmail_message_id,
          threadId: latest.gmail_thread_id,
          internetMessageId: latest.internet_message_id,
          mailbox,
          subject: latest.subject?.match(/^re:/i)
            ? latest.subject
            : `Re: ${latest.subject ?? ""}`.trim(),
          to: [...replyTo],
          cc: [...replyCc],
          blockedReason: allowedMailbox
            ? null
            : `Email reply blocked: ${mailbox ?? "no monitored mailbox"} is not an approved send inbox`,
        }
      : null,
    newEmail: {
      defaultFrom: "info@maverickexteriorskc.com",
      fromOptions: [...ALLOWED_GMAIL_SENDERS],
      to: contact?.email ? [contact.email.toLowerCase()] : [],
    },
  };
}

export function isAllowedGmailSender(value: string): boolean {
  return ALLOWED_GMAIL_SENDERS.includes(
    value.toLowerCase() as (typeof ALLOWED_GMAIL_SENDERS)[number]
  );
}
