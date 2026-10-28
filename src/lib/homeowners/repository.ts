import { query, queryOne } from "@/lib/db";
import { logServerError } from "@/lib/server-error";
import {
  resolveContactIdentity,
  type ContactIdentity,
} from "./identity";
import {
  encodeTimelineCursor,
  type MatchType,
  type TimelineCursor,
  type TimelineEntry,
} from "./timeline";

// Temporary Phase 1 test-data rule. Jack should confirm this definition:
// exclude names containing the whole word "test", plus jobs whose explicit
// sequence exclusion reason contains "test".
export const HOMEOWNER_TEST_RECORD_RULE =
  "whole-word test in contact/job name or test-marked seq_job_exclusions";

const CONTACT_NOT_TEST_SQL = `
  COALESCE(c.display_name, c.first_name || ' ' || c.last_name, '') !~* '\\mtest\\M'
`;

function jobNotTestSql(alias: "j" | "job"): string {
  return `
  COALESCE(${alias}.name, '') !~* '\\mtest\\M'
  AND NOT EXISTS (
    SELECT 1
    FROM seq_job_exclusions exclusion
    WHERE exclusion.job_number = ${alias}.number
      AND COALESCE(exclusion.reason, '') ~* '\\mtest\\M'
  )
`;
}

export interface HomeownerSearchResult {
  contactJnid: string;
  name: string;
  address: string | null;
  status: string | null;
  jobCount: number;
}

export interface HomeownerJob {
  jobJnid: string;
  number: string | null;
  name: string;
  address: string | null;
  status: string | null;
  salesRep: string | null;
  claimNumber: string | null;
  carrier: string | null;
  dateOfLoss: string | null;
}

export interface CampaignEnrollment {
  id: string;
  engine: "sequence" | "marketing" | "hatch";
  campaign: string;
  state: string;
  detail: string | null;
  updatedAt: string | null;
  matchType: MatchType;
}

export interface Suppression {
  id: string;
  channel: string;
  reason: string;
  source: string;
  createdAt: string;
  matchType: MatchType;
}

interface ContactRow {
  contact_jnid: string;
  display_name: string;
  email: string | null;
  mobile_phone: string | null;
  home_phone: string | null;
  work_phone: string | null;
  address: string | null;
  disable_auto_text: boolean;
}

interface TimelineQueryResult {
  events: TimelineEntry[] | null;
  freshness: Record<string, string> | null;
}

function unixDate(value: string | number | null): string | null {
  if (!value) return null;
  const milliseconds = Number(value) * 1000;
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

export async function searchHomeowners(
  search: string,
  limit = 25
): Promise<HomeownerSearchResult[]> {
  const escaped = search.trim().replace(/[\\%_]/g, "\\$&");
  if (escaped.length < 2) return [];

  const rows = await query<{
    contact_jnid: string;
    name: string;
    address: string | null;
    status: string | null;
    job_count: string;
  }>(
    `SELECT
       c.jnid AS contact_jnid,
       COALESCE(NULLIF(c.display_name, ''), NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Unnamed contact') AS name,
       COALESCE(
         NULLIF(TRIM(CONCAT_WS(', ', c.address_line1, c.city, c.state_text, c.zip)), ''),
         MIN(NULLIF(TRIM(CONCAT_WS(', ', j.address_line1, j.city, j.state_text, j.zip)), ''))
       ) AS address,
       COALESCE(c.status_name, MIN(j.status_name)) AS status,
       COUNT(DISTINCT j.jnid)::text AS job_count
     FROM contacts c
     LEFT JOIN job_contacts jc ON jc.contact_id = c.id
     LEFT JOIN jobs j
       ON (j.id = jc.job_id OR j.primary_contact_jnid = c.jnid)
      AND ${jobNotTestSql("j")}
     WHERE c.deleted_at IS NULL
       AND ${CONTACT_NOT_TEST_SQL}
       AND (
         COALESCE(c.display_name, '') ILIKE $1 ESCAPE '\\'
         OR TRIM(CONCAT_WS(' ', c.first_name, c.last_name)) ILIKE $1 ESCAPE '\\'
         OR COALESCE(c.address_line1, '') ILIKE $1 ESCAPE '\\'
         OR COALESCE(j.address_line1, '') ILIKE $1 ESCAPE '\\'
       )
     GROUP BY c.jnid, c.display_name, c.first_name, c.last_name,
              c.address_line1, c.city, c.state_text, c.zip, c.status_name
     ORDER BY name
     LIMIT $2`,
    [`%${escaped}%`, Math.min(Math.max(limit, 1), 50)]
  );

  return rows.map((row) => ({
    contactJnid: row.contact_jnid,
    name: row.name,
    address: row.address,
    status: row.status,
    jobCount: Number(row.job_count),
  }));
}

async function loadIdentity(
  contactJnid: string
): Promise<ReturnType<typeof resolveContactIdentity>> {
  const rows = await query<{
    contact_jnid: string;
    mobile_phone: string | null;
    home_phone: string | null;
    work_phone: string | null;
    email: string | null;
    extra_phones: string[];
  }>(
    `SELECT
       c.jnid AS contact_jnid,
       c.mobile_phone,
       c.home_phone,
       c.work_phone,
       c.email,
       COALESCE(
         ARRAY_AGG(DISTINCT cpn.phone_number_e164)
           FILTER (WHERE cpn.phone_number_e164 IS NOT NULL),
         ARRAY[]::varchar[]
       ) AS extra_phones
     FROM contacts c
     LEFT JOIN contact_phone_numbers cpn ON cpn.contact_id = c.id
     WHERE c.deleted_at IS NULL
     GROUP BY c.id`,
    []
  );

  const identities: ContactIdentity[] = rows.map((row) => ({
    contactJnid: row.contact_jnid,
    phones: [
      row.mobile_phone,
      row.home_phone,
      row.work_phone,
      ...row.extra_phones,
    ],
    emails: [row.email],
  }));
  return resolveContactIdentity(contactJnid, identities);
}

async function loadTimeline(
  contactJnid: string,
  jobJnids: string[],
  phoneDigits: string[],
  emails: string[],
  before: TimelineCursor | null,
  limit: number
): Promise<{
  events: TimelineEntry[];
  freshness: Record<string, string>;
  nextCursor: string | null;
}> {
  const result = await queryOne<TimelineQueryResult>(
    `WITH all_events AS (
       SELECT
         s.id::text AS id,
         'sms_messages'::text AS source,
         'SMS'::text AS channel,
         s.direction::text AS direction,
         COALESCE(s.phone_number_id, s.from_number)::text AS line,
         s.sent_at AS "occurredAt",
         LEFT(COALESCE(s.message_text, '(media message)'), 180) AS preview,
         s.message_text::text AS body,
         CASE
           WHEN s.contact_jnid = $1 THEN 'direct'
           WHEN s.job_jnid = ANY($2::text[]) THEN 'job'
           ELSE 'phone_fallback'
         END::text AS "matchType"
       FROM sms_messages s
       WHERE s.deleted_at IS NULL
         AND (
           s.contact_jnid = $1
           OR s.job_jnid = ANY($2::text[])
           OR (
             s.contact_jnid IS NULL AND s.job_jnid IS NULL
             AND (
               regexp_replace(COALESCE(s.from_number, ''), '\\D', '', 'g') = ANY($3::text[])
               OR EXISTS (
                 SELECT 1 FROM unnest(COALESCE(s.to_numbers, ARRAY[]::varchar[])) destination
                 WHERE regexp_replace(destination, '\\D', '', 'g') = ANY($3::text[])
               )
             )
           )
         )

       UNION ALL

       SELECT
         c.id::text, 'calls', 'Call', c.direction,
         COALESCE(c.phone_number_id, c.from_number),
         c.started_at,
         LEFT(COALESCE(NULLIF(c.voicemail_transcript, ''), NULLIF(c.transcript, ''), c.notes, c.status, 'Call'), 180),
         COALESCE(NULLIF(c.voicemail_transcript, ''), NULLIF(c.transcript, ''), c.notes),
         CASE
           WHEN c.contact_jnid = $1 THEN 'direct'
           WHEN c.job_jnid = ANY($2::text[]) THEN 'job'
           ELSE 'phone_fallback'
         END
       FROM calls c
       WHERE c.deleted_at IS NULL
         AND (
           c.contact_jnid = $1
           OR c.job_jnid = ANY($2::text[])
           OR (
             c.contact_jnid IS NULL AND c.job_jnid IS NULL
             AND (
               regexp_replace(COALESCE(c.from_number, ''), '\\D', '', 'g') = ANY($3::text[])
               OR regexp_replace(COALESCE(c.to_number, ''), '\\D', '', 'g') = ANY($3::text[])
             )
           )
         )

       UNION ALL

       SELECT
         e.id::text, 'emails', 'Email', e.direction, e.monitored_mailbox,
         COALESCE(e.sent_at, e.received_at, e.created_at),
         LEFT(COALESCE(NULLIF(e.snippet, ''), NULLIF(e.subject, ''), NULLIF(e.body_text, ''), 'Email'), 180),
         COALESCE(NULLIF(e.body_text, ''), e.snippet),
         CASE
           WHEN e.contact_jnid = $1 THEN 'direct'
           WHEN e.job_jnid = ANY($2::text[]) THEN 'job'
           ELSE 'email_fallback'
         END
       FROM emails e
       WHERE (
         e.contact_jnid = $1
         OR e.job_jnid = ANY($2::text[])
         OR (
           e.contact_jnid IS NULL AND e.job_jnid IS NULL
           AND (
             LOWER(COALESCE(e.from_email, '')) = ANY($4::text[])
             OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements(
                 CASE
                   WHEN jsonb_typeof(e.to_recipients) = 'array'
                     THEN e.to_recipients
                   ELSE '[]'::jsonb
                 END
               ) recipient
               WHERE LOWER(
                 COALESCE(recipient->>'email', recipient->>'address', '')
               ) = ANY($4::text[])
             )
           )
         )
       )

       UNION ALL

       SELECT
         a.id::text, 'activities', COALESCE(a.activity_type_code, 'Activity'),
         NULL, a.performed_by_name, a.activity_date,
         LEFT(COALESCE(NULLIF(a.subject, ''), NULLIF(a.content, ''), NULLIF(a.to_status, ''), 'JobNimbus activity'), 180),
         COALESCE(NULLIF(a.content, ''), NULLIF(a.subject, ''), CONCAT_WS(' → ', a.from_status, a.to_status)),
         CASE WHEN a.contact_jnid = $1 THEN 'direct' ELSE 'job' END
       FROM activities a
       WHERE a.deleted_at IS NULL
         AND (a.contact_jnid = $1 OR a.job_jnid = ANY($2::text[]))

       UNION ALL

       SELECT
         outbound.id::text, 'campaign_outbound_messages',
         COALESCE(outbound.channel, 'Campaign'), 'outbound', outbound.from_address,
         COALESCE(outbound.sent_at, outbound.created_at),
         LEFT(COALESCE(NULLIF(outbound.subject, ''), NULLIF(outbound.body_text, ''), outbound.status, 'Campaign message'), 180),
         outbound.body_text,
         CASE
           WHEN outbound.contact_jnid = $1 THEN 'direct'
           WHEN outbound.job_jnid = ANY($2::text[]) THEN 'job'
           WHEN LOWER(COALESCE(outbound.to_address, '')) = ANY($4::text[]) THEN 'email_fallback'
           ELSE 'phone_fallback'
         END
       FROM campaign_outbound_messages outbound
       WHERE (
         outbound.contact_jnid = $1
         OR outbound.job_jnid = ANY($2::text[])
         OR (
           outbound.contact_jnid IS NULL AND outbound.job_jnid IS NULL
           AND (
             LOWER(COALESCE(outbound.to_address, '')) = ANY($4::text[])
             OR regexp_replace(COALESCE(outbound.to_address, ''), '\\D', '', 'g') = ANY($3::text[])
           )
         )
       )

       UNION ALL

       SELECT
         inbound.id::text, 'campaign_inbound_messages',
         CASE WHEN inbound.phone IS NULL THEN 'Email' ELSE 'SMS' END,
         'inbound', inbound.to_address, inbound.created_at,
         LEFT(COALESCE(NULLIF(inbound.subject, ''), NULLIF(inbound.body_text, ''), inbound.intent, 'Campaign reply'), 180),
         inbound.body_text,
         CASE
           WHEN inbound.contact_jnid = $1 THEN 'direct'
           WHEN inbound.job_jnid = ANY($2::text[]) THEN 'job'
           WHEN LOWER(COALESCE(inbound.from_address, '')) = ANY($4::text[]) THEN 'email_fallback'
           ELSE 'phone_fallback'
         END
       FROM campaign_inbound_messages inbound
       WHERE (
         inbound.contact_jnid = $1
         OR inbound.job_jnid = ANY($2::text[])
         OR (
           inbound.contact_jnid IS NULL AND inbound.job_jnid IS NULL
           AND (
             LOWER(COALESCE(inbound.from_address, '')) = ANY($4::text[])
             OR regexp_replace(COALESCE(inbound.phone, ''), '\\D', '', 'g') = ANY($3::text[])
           )
         )
       )
     ),
     eligible AS (
       SELECT *
       FROM all_events
       WHERE "occurredAt" IS NOT NULL
         AND (
           $5::timestamptz IS NULL
           OR ("occurredAt", source, id) <
              ($5::timestamptz, $6::text, $7::text)
         )
     ),
     page AS (
       SELECT *
       FROM eligible
       ORDER BY "occurredAt" DESC, source DESC, id DESC
       LIMIT $8
     )
     SELECT
       COALESCE((SELECT jsonb_agg(page ORDER BY "occurredAt" DESC, source DESC, id DESC) FROM page), '[]'::jsonb) AS events,
       COALESCE((
         SELECT jsonb_object_agg(source, newest)
         FROM (
           SELECT source, MAX("occurredAt") AS newest
           FROM all_events
           GROUP BY source
         ) source_freshness
       ), '{}'::jsonb) AS freshness`,
    [
      contactJnid,
      jobJnids,
      phoneDigits,
      emails,
      before?.occurredAt ?? null,
      before?.source ?? null,
      before?.id ?? null,
      Math.min(Math.max(limit, 1), 100) + 1,
    ]
  );

  const pageSize = Math.min(Math.max(limit, 1), 100);
  const events = result?.events ?? [];
  return {
    events: events.slice(0, pageSize),
    freshness: result?.freshness ?? {},
    nextCursor:
      events.length > pageSize && events[pageSize - 1]
        ? encodeTimelineCursor({
            occurredAt: events[pageSize - 1].occurredAt,
            source: events[pageSize - 1].source,
            id: events[pageSize - 1].id,
          })
        : null,
  };
}

export async function getHomeownerDetail(
  contactJnid: string,
  before: TimelineCursor | null,
  limit = 100
) {
  const contact = await queryOne<ContactRow>(
    `SELECT
       c.jnid AS contact_jnid,
       COALESCE(NULLIF(c.display_name, ''), NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), 'Unnamed contact') AS display_name,
       c.email,
       c.mobile_phone,
       c.home_phone,
       c.work_phone,
       NULLIF(TRIM(CONCAT_WS(', ', c.address_line1, c.address_line2, c.city, c.state_text, c.zip)), '') AS address,
       COALESCE(c.disable_auto_text, false) AS disable_auto_text
     FROM contacts c
     WHERE c.jnid = $1
       AND c.deleted_at IS NULL
       AND ${CONTACT_NOT_TEST_SQL}`,
    [contactJnid]
  );
  if (!contact) return null;

  const jobRows = await query<{
    job_jnid: string;
    number: string | null;
    name: string;
    address: string | null;
    status: string | null;
    sales_rep: string | null;
    claim_number: string | null;
    carrier: string | null;
    date_of_loss: string | number | null;
  }>(
    `SELECT DISTINCT
       j.jnid AS job_jnid,
       j.number,
       COALESCE(NULLIF(j.name, ''), j.number, 'Unnamed job') AS name,
       NULLIF(TRIM(CONCAT_WS(', ', j.address_line1, j.address_line2, j.city, j.state_text, j.zip)), '') AS address,
       j.status_name AS status,
       COALESCE(j.sales_rep_name, rep.name) AS sales_rep,
       j.cf_string_4 AS claim_number,
       j.cf_string_3 AS carrier,
       j.cf_date_1 AS date_of_loss
     FROM jobs j
     LEFT JOIN job_contacts jc ON jc.job_id = j.id
     LEFT JOIN jobnimbus_users rep ON rep.jnid = j.sales_rep_jnid
     WHERE (j.primary_contact_jnid = $1 OR jc.contact_jnid = $1)
       AND j.deleted_at IS NULL
       AND ${jobNotTestSql("j")}
     ORDER BY name`,
    [contactJnid]
  );
  const jobs: HomeownerJob[] = jobRows.map((job) => ({
    jobJnid: job.job_jnid,
    number: job.number,
    name: job.name,
    address: job.address,
    status: job.status,
    salesRep: job.sales_rep,
    claimNumber: job.claim_number,
    carrier: job.carrier,
    dateOfLoss: unixDate(job.date_of_loss),
  }));
  const jobJnids = jobs.map((job) => job.jobJnid);
  const identity = await loadIdentity(contactJnid);

  const [sequenceRows, marketingRows, hatchRows, suppressions, exclusions, timeline] =
    await Promise.all([
      query<CampaignEnrollment>(
        `SELECT
           enrollment.id::text AS id,
           'sequence'::text AS engine,
           campaign.name AS campaign,
           enrollment.state,
           enrollment.exit_reason AS detail,
           COALESCE(enrollment.exited_at, enrollment.entered_at, enrollment.created_at)::text AS "updatedAt",
           CASE
             WHEN enrollment.contact_jnid = $1 THEN 'direct'
             WHEN enrollment.job_jnid = ANY($2::text[]) THEN 'job'
             WHEN LOWER(COALESCE(enrollment.email, '')) = ANY($4::text[]) THEN 'email_fallback'
             ELSE 'phone_fallback'
           END::text AS "matchType"
         FROM seq_enrollments enrollment
         JOIN seq_campaigns campaign ON campaign.key = enrollment.campaign_key
         WHERE enrollment.state <> 'exited'
           AND (
             enrollment.contact_jnid = $1
             OR enrollment.job_jnid = ANY($2::text[])
             OR (
               enrollment.contact_jnid IS NULL AND enrollment.job_jnid IS NULL
               AND (
                 regexp_replace(COALESCE(enrollment.phone_e164, ''), '\\D', '', 'g') = ANY($3::text[])
                 OR LOWER(COALESCE(enrollment.email, '')) = ANY($4::text[])
               )
             )
           )`,
        [contactJnid, jobJnids, identity.phoneDigits, identity.emails]
      ),
      query<CampaignEnrollment>(
        `SELECT
           member.id::text AS id,
           'marketing'::text AS engine,
           campaign.name AS campaign,
           COALESCE(member.enrollment_state, member.status) AS state,
           COALESCE(member.pause_reason, member.exit_reason, ARRAY_TO_STRING(member.suppression_reasons, ', ')) AS detail,
           COALESCE(member.last_event_at, member.updated_at, member.created_at)::text AS "updatedAt",
           CASE WHEN member.contact_jnid = $1 THEN 'direct' ELSE 'job' END::text AS "matchType"
         FROM marketing_automation_campaign_contacts member
         JOIN marketing_automation_campaigns campaign ON campaign.id = member.campaign_id
         WHERE COALESCE(member.enrollment_state, member.status) NOT IN ('exited', 'discarded')
           AND (member.contact_jnid = $1 OR member.job_jnid = ANY($2::text[]))`,
        [contactJnid, jobJnids]
      ),
      query<CampaignEnrollment>(
        `SELECT
           intake.id::text AS id,
           'hatch'::text AS engine,
           'Hatch intake'::text AS campaign,
           intake.status,
           COALESCE(intake.outcome_code, intake.payload->>'source') AS detail,
           intake.created_at::text AS "updatedAt",
           CASE
             WHEN intake.payload->>'externalID' = $1 THEN 'direct'
             WHEN intake.payload->>'externalID' = ANY($2::text[]) THEN 'job'
             WHEN LOWER(COALESCE(intake.payload->>'email', '')) = ANY($4::text[]) THEN 'email_fallback'
             ELSE 'phone_fallback'
           END::text AS "matchType"
         FROM op_hatch.intakes intake
         WHERE (
           intake.payload->>'externalID' = $1
           OR intake.payload->>'externalID' = ANY($2::text[])
           OR LOWER(COALESCE(intake.payload->>'email', '')) = ANY($4::text[])
           OR regexp_replace(COALESCE(intake.payload->>'phoneNumber', ''), '\\D', '', 'g') = ANY($3::text[])
         )
         
         UNION ALL

         SELECT
           webhook.id::text,
           'hatch',
           COALESCE(
             webhook.body->'data'->'payload'->>'campaign_name',
             webhook.body->'data'->'payload'->'campaign'->>'name',
             'Hatch webhook'
           ),
           COALESCE(
             webhook.body->'data'->'payload'->>'status',
             webhook.event_type
           ),
           webhook.event_type,
           COALESCE(webhook.occurred_at, webhook.received_at)::text,
           CASE
             WHEN webhook.body->'data'->'payload'->>'external_contact_id' = $1 THEN 'direct'
             WHEN webhook.body->'data'->'payload'->>'external_opportunity_id' = ANY($2::text[]) THEN 'job'
             WHEN LOWER(COALESCE(webhook.body->'data'->'payload'->>'email', '')) = ANY($4::text[]) THEN 'email_fallback'
             ELSE 'phone_fallback'
           END
         FROM hatch_webhook_events webhook
         WHERE (
           webhook.body->'data'->'payload'->>'external_contact_id' = $1
           OR webhook.body->'data'->'payload'->>'external_opportunity_id' = ANY($2::text[])
           OR LOWER(COALESCE(webhook.body->'data'->'payload'->>'email', '')) = ANY($4::text[])
           OR regexp_replace(COALESCE(webhook.body->'data'->'payload'->>'phone', ''), '\\D', '', 'g') = ANY($3::text[])
         )
         ORDER BY "updatedAt" DESC
         LIMIT 25`,
        [contactJnid, jobJnids, identity.phoneDigits, identity.emails]
      ),
      query<Suppression>(
        `SELECT
           suppression.id::text AS id,
           suppression.channel,
           suppression.reason,
           suppression.source,
           suppression.created_at::text AS "createdAt",
           CASE
             WHEN suppression.contact_jnid = $1 THEN 'direct'
             WHEN suppression.job_jnid = ANY($2::text[]) THEN 'job'
             WHEN LOWER(COALESCE(suppression.email, '')) = ANY($4::text[]) THEN 'email_fallback'
             ELSE 'phone_fallback'
           END::text AS "matchType"
         FROM communication_suppressions suppression
         WHERE (suppression.expires_at IS NULL OR suppression.expires_at > NOW())
           AND (
             suppression.contact_jnid = $1
             OR suppression.job_jnid = ANY($2::text[])
             OR (
               suppression.contact_jnid IS NULL AND suppression.job_jnid IS NULL
               AND (
                 regexp_replace(COALESCE(suppression.phone, ''), '\\D', '', 'g') = ANY($3::text[])
                 OR LOWER(COALESCE(suppression.email, '')) = ANY($4::text[])
               )
             )
           )`,
        [contactJnid, jobJnids, identity.phoneDigits, identity.emails]
      ),
      query<{ job_number: string; reason: string }>(
        `SELECT exclusion.job_number, exclusion.reason
         FROM seq_job_exclusions exclusion
         JOIN jobs j ON j.number = exclusion.job_number
         WHERE j.jnid = ANY($1::text[])`,
        [jobJnids]
      ),
      loadTimeline(
        contactJnid,
        jobJnids,
        identity.phoneDigits,
        identity.emails,
        before,
        limit
      ),
    ]);

  return {
    contact: {
      contactJnid: contact.contact_jnid,
      name: contact.display_name,
      address: contact.address,
      phones: [
        contact.mobile_phone,
        contact.home_phone,
        contact.work_phone,
      ].filter(Boolean),
      emails: [contact.email].filter(Boolean),
    },
    jobs,
    campaigns: [...sequenceRows, ...marketingRows, ...hatchRows],
    suppressions,
    exclusions,
    doNotText:
      contact.disable_auto_text ||
      suppressions.some(
        (suppression) =>
          suppression.channel.toLowerCase() === "sms" ||
          suppression.channel.toLowerCase() === "all"
      ),
    identityWarnings: {
      ambiguousPhones: identity.ambiguousPhones,
      ambiguousEmails: identity.ambiguousEmails,
    },
    timeline,
  };
}

interface BoardCardRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  engine: "sequence" | "marketing";
  state: string;
  needs_human: boolean;
  contact_jnid: string | null;
  homeowner_name: string;
  job_status: string | null;
  sales_rep: string | null;
  updated_at: string;
}

export interface BoardSourceWarning {
  source: "sequence" | "marketing";
  message: string;
}

async function loadSequenceBoardRows(): Promise<BoardCardRow[]> {
  return query<BoardCardRow>(
    `SELECT
       enrollment.id::text AS id,
       campaign.key AS campaign_id,
       campaign.name AS campaign_name,
       'sequence'::text AS engine,
       COALESCE(enrollment.state, 'unknown') AS state,
       false AS needs_human,
       COALESCE(enrollment.contact_jnid, job.primary_contact_jnid) AS contact_jnid,
       COALESCE(NULLIF(contact.display_name, ''), job.primary_contact_name, job.name, 'Unknown homeowner') AS homeowner_name,
       job.status_name AS job_status,
       COALESCE(enrollment.sales_rep_name, job.sales_rep_name) AS sales_rep,
       COALESCE(enrollment.exited_at, enrollment.entered_at, enrollment.created_at) AS updated_at
     FROM seq_enrollments enrollment
     JOIN seq_campaigns campaign ON campaign.key = enrollment.campaign_key
     LEFT JOIN contacts contact ON contact.jnid = enrollment.contact_jnid
     LEFT JOIN jobs job ON job.jnid = enrollment.job_jnid
     WHERE COALESCE(contact.display_name, job.primary_contact_name, job.name, '') !~* '\\mtest\\M'
       AND (job.id IS NULL OR (${jobNotTestSql("job")}))
     ORDER BY campaign.name, updated_at DESC`,
    []
  );
}

async function loadMarketingBoardRows(): Promise<BoardCardRow[]> {
  return query<BoardCardRow>(
    `SELECT
       member.id::text AS id,
       campaign.id::text AS campaign_id,
       campaign.name AS campaign_name,
       'marketing'::text AS engine,
       COALESCE(member.enrollment_state, member.status, 'unknown') AS state,
       COALESCE(member.needs_human, false) AS needs_human,
       COALESCE(member.contact_jnid, job.primary_contact_jnid) AS contact_jnid,
       COALESCE(NULLIF(contact.display_name, ''), job.primary_contact_name, job.name, 'Unknown homeowner') AS homeowner_name,
       job.status_name AS job_status,
       job.sales_rep_name AS sales_rep,
       COALESCE(member.last_event_at, member.updated_at, member.created_at) AS updated_at
     FROM marketing_automation_campaign_contacts member
     JOIN marketing_automation_campaigns campaign ON campaign.id = member.campaign_id
     LEFT JOIN contacts contact ON contact.jnid = member.contact_jnid
     LEFT JOIN jobs job ON job.jnid = member.job_jnid
     WHERE COALESCE(contact.display_name, job.primary_contact_name, job.name, '') !~* '\\mtest\\M'
       AND (job.id IS NULL OR (${jobNotTestSql("job")}))
     ORDER BY campaign.name, updated_at DESC`,
    []
  );
}

async function loadBoardSource(
  source: BoardSourceWarning["source"],
  loader: () => Promise<BoardCardRow[]>
): Promise<{ rows: BoardCardRow[]; warning: BoardSourceWarning | null }> {
  try {
    return { rows: await loader(), warning: null };
  } catch (error) {
    logServerError(`[Campaign Board] ${source} source failed`, error);
    return {
      rows: [],
      warning: {
        source,
        message: `${source === "sequence" ? "Sequence" : "Marketing"} campaigns are temporarily unavailable.`,
      },
    };
  }
}

export async function getCampaignBoard() {
  const [sequence, marketing] = await Promise.all([
    loadBoardSource("sequence", loadSequenceBoardRows),
    loadBoardSource("marketing", loadMarketingBoardRows),
  ]);
  const rows = [...sequence.rows, ...marketing.rows].sort(
    (left, right) =>
      left.campaign_name.localeCompare(right.campaign_name) ||
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );

  const campaigns = new Map<
    string,
    {
      id: string;
      name: string;
      engine: string;
      columns: Record<string, BoardCardRow[]>;
    }
  >();
  for (const row of rows) {
    const campaign = campaigns.get(row.campaign_id) ?? {
      id: row.campaign_id,
      name: row.campaign_name,
      engine: row.engine,
      columns: {
        in_progress: [],
        needs_human: [],
        paused: [],
        discard: [],
      },
    };
    const normalized = row.state.toLowerCase();
    const column = row.needs_human
      ? "needs_human"
      : normalized.includes("pause")
        ? "paused"
        : ["exited", "discarded", "suppressed", "failed"].some((state) =>
              normalized.includes(state)
            )
          ? "discard"
          : "in_progress";
    campaign.columns[column].push(row);
    campaigns.set(row.campaign_id, campaign);
  }

  return {
    campaigns: [...campaigns.values()],
    warnings: [sequence.warning, marketing.warning].filter(
      (warning): warning is BoardSourceWarning => warning !== null
    ),
  };
}
