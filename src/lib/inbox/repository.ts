import { query } from "@/lib/db";
import { logServerError } from "@/lib/server-error";
import {
  INSURANCE_STATUSES,
  SALES_FOLLOW_UP_STATUSES,
  SPEED_TO_LEAD_STATUSES,
  WORKSPACE_LABELS,
  statusesForWorkspace,
} from "./constants";
import type {
  InboxResponse,
  InboxRow,
  WorkspaceKey,
  WorkspaceSummary,
} from "./types";

export interface InboxDatabaseRow {
  contact_jnid: string;
  job_jnid: string | null;
  name: string;
  street: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  status_order: number | null;
  sales_rep: string | null;
  campaign: string | null;
  last_at: string | null;
  preview: string | null;
  channel: string | null;
  direction: string | null;
  line: string | null;
  sender: string | null;
  event_status: string | null;
  is_voicemail: boolean | null;
  duration_seconds: number | null;
  automated: boolean | null;
}

const NOT_TEST_JOB_SQL = `
  COALESCE(j.name, '') !~* '\\mtest\\M'
  AND COALESCE(j.primary_contact_name, '') !~* '\\mtest\\M'
  AND COALESCE(c.display_name, '') !~* '\\mtest\\M'
  AND NOT EXISTS (
    SELECT 1
    FROM seq_job_exclusions exclusion
    WHERE exclusion.job_number = j.number
      AND COALESCE(exclusion.reason, '') ~* '\\mtest\\M'
  )
`;

function workspaceRecordTypes(workspace: WorkspaceKey): string[] {
  if (workspace === "insurance") return ["Insurance"];
  if (workspace === "speed_to_lead" || workspace === "sales_follow_up") {
    return ["Retail", "Repairs"];
  }
  return [];
}

export function isUnresponded(row: InboxDatabaseRow): boolean {
  if (row.automated) return true;
  if (row.channel === "SMS" && row.direction === "incoming") return true;
  if (
    row.channel === "Call" &&
    row.direction === "inbound" &&
    (row.is_voicemail ||
      !row.duration_seconds ||
      ["missed", "no-answer", "failed"].includes(
        row.event_status?.toLowerCase() ?? ""
      ))
  ) {
    return true;
  }
  return false;
}

function mapRow(row: InboxDatabaseRow): InboxRow {
  const unresponded = isUnresponded(row);
  return {
    contactJnid: row.contact_jnid,
    jobJnid: row.job_jnid,
    name: row.name,
    street: row.street,
    phone: row.phone,
    email: row.email,
    status: row.status,
    statusOrder: row.status_order ?? 999,
    salesRep: row.sales_rep,
    campaign: row.campaign,
    lastAt: row.last_at,
    preview: row.preview ?? "No communication yet",
    channel: row.channel ?? "Activity",
    direction: row.direction,
    line: row.line,
    sender: row.sender,
    unread: row.direction === "incoming" || row.direction === "inbound",
    unresponded,
    jobUrl: row.job_jnid
      ? `https://app.jobnimbus.com/jobs/${encodeURIComponent(row.job_jnid)}`
      : null,
  };
}

async function loadJobWorkspaceRows(
  workspace: WorkspaceKey,
  search: string,
  limit: number,
  offset: number
): Promise<InboxDatabaseRow[]> {
  const statuses = statusesForWorkspace(workspace);
  const recordTypes = workspaceRecordTypes(workspace);
  return query<InboxDatabaseRow>(
    `WITH cohort AS (
       SELECT DISTINCT ON (COALESCE(j.primary_contact_jnid, j.jnid))
         COALESCE(j.primary_contact_jnid, j.jnid) AS contact_jnid,
         j.jnid AS job_jnid,
         COALESCE(NULLIF(c.display_name, ''), NULLIF(j.primary_contact_name, ''), NULLIF(j.name, ''), 'Unknown homeowner') AS name,
         COALESCE(NULLIF(c.address_line1, ''), NULLIF(j.address_line1, '')) AS street,
         COALESCE(NULLIF(c.mobile_phone, ''), NULLIF(j.primary_contact_number, '')) AS phone,
         COALESCE(NULLIF(c.email, ''), NULLIF(j.primary_contact_email, '')) AS email,
         j.status_name AS status,
         COALESCE(
           ARRAY_POSITION($1::text[], j.status_name),
           stage.stage_order,
           999
         ) AS status_order,
         j.sales_rep_name AS sales_rep
       FROM jobs j
       LEFT JOIN contacts c
         ON c.jnid = j.primary_contact_jnid
        AND c.deleted_at IS NULL
       LEFT JOIN workflow_stages stage ON stage.id = j.current_stage_id
       WHERE j.deleted_at IS NULL
         AND COALESCE(j.is_active, true) = true
         AND COALESCE(j.is_archived, false) = false
         AND j.record_type_name = ANY($2::text[])
         AND j.status_name = ANY($1::text[])
         AND ${NOT_TEST_JOB_SQL}
         AND (
           $3::text = ''
           OR COALESCE(c.display_name, j.primary_contact_name, j.name, '') ILIKE '%' || $3 || '%'
           OR COALESCE(c.address_line1, j.address_line1, '') ILIKE '%' || $3 || '%'
         )
       ORDER BY
         COALESCE(j.primary_contact_jnid, j.jnid),
         j.jn_date_updated DESC NULLS LAST,
         j.updated_at DESC
     )
     SELECT
       cohort.*,
       campaign.name AS campaign,
       latest.last_at,
       latest.preview,
       latest.channel,
       latest.direction,
       latest.line,
       latest.sender,
       latest.event_status,
       latest.is_voicemail,
       latest.duration_seconds,
       latest.automated
     FROM cohort
     LEFT JOIN LATERAL (
       SELECT tag.name
       FROM (
         SELECT seq_campaign.name, enrollment.entered_at AS tagged_at
         FROM seq_enrollments enrollment
         JOIN seq_campaigns seq_campaign
           ON seq_campaign.key = enrollment.campaign_key
         WHERE enrollment.state <> 'exited'
           AND (
             enrollment.contact_jnid = cohort.contact_jnid
             OR enrollment.job_jnid = cohort.job_jnid
           )
         UNION ALL
         SELECT marketing_campaign.name,
                COALESCE(member.last_event_at, member.updated_at, member.created_at)
         FROM marketing_automation_campaign_contacts member
         JOIN marketing_automation_campaigns marketing_campaign
           ON marketing_campaign.id = member.campaign_id
         WHERE COALESCE(member.enrollment_state, member.status) NOT IN ('exited', 'discarded')
           AND (
             member.contact_jnid = cohort.contact_jnid
             OR member.job_jnid = cohort.job_jnid
           )
       ) tag
       ORDER BY tag.tagged_at DESC NULLS LAST
       LIMIT 1
     ) campaign ON true
     LEFT JOIN LATERAL (
       SELECT event.*
       FROM (
         (SELECT s.sent_at AS last_at,
                LEFT(COALESCE(s.message_text, '(media message)'), 240) AS preview,
                'SMS'::text AS channel,
                s.direction::text AS direction,
                COALESCE(line.name, line.phone_number_formatted, s.phone_number_id)::text AS line,
                CASE WHEN s.direction = 'outgoing'
                  THEN COALESCE(op_user.name, 'You')
                  ELSE cohort.name
                END::text AS sender,
                s.status::text AS event_status,
                false AS is_voicemail,
                NULL::integer AS duration_seconds,
                false AS automated
         FROM sms_messages s
         LEFT JOIN openphone_phone_numbers line
           ON line.phone_number_id = s.phone_number_id
         LEFT JOIN openphone_users op_user
           ON op_user.openphone_user_id = s.openphone_user_id
         WHERE s.deleted_at IS NULL
           AND (s.contact_jnid = cohort.contact_jnid OR s.job_jnid = cohort.job_jnid)
         ORDER BY s.sent_at DESC
         LIMIT 1)

         UNION ALL

         (SELECT call.started_at,
                LEFT(COALESCE(NULLIF(call.voicemail_transcript, ''), NULLIF(call.transcript, ''), call.status, 'Call'), 240),
                'Call', call.direction,
                COALESCE(line.name, line.phone_number_formatted, call.phone_number_id),
                CASE WHEN call.direction = 'outbound'
                  THEN COALESCE(op_user.name, 'You')
                  ELSE cohort.name
                END,
                call.status, COALESCE(call.is_voicemail, false),
                call.duration_seconds, false
         FROM calls call
         LEFT JOIN openphone_phone_numbers line
           ON line.phone_number_id = call.phone_number_id
         LEFT JOIN openphone_users op_user
           ON op_user.openphone_user_id = call.openphone_user_id
         WHERE call.deleted_at IS NULL
           AND (call.contact_jnid = cohort.contact_jnid OR call.job_jnid = cohort.job_jnid)
         ORDER BY call.started_at DESC
         LIMIT 1)

         UNION ALL

         (SELECT COALESCE(email.sent_at, email.received_at, email.created_at),
                LEFT(COALESCE(NULLIF(email.snippet, ''), NULLIF(email.subject, ''), NULLIF(email.body_text, ''), 'Email'), 240),
                'Email', email.direction, email.monitored_mailbox,
                CASE WHEN email.direction = 'outbound'
                  THEN COALESCE(email.from_name, email.monitored_mailbox, 'You')
                  ELSE COALESCE(email.from_name, cohort.name)
                END,
                email.processing_status, false, NULL, false
         FROM emails email
         WHERE email.contact_jnid = cohort.contact_jnid OR email.job_jnid = cohort.job_jnid
         ORDER BY COALESCE(email.sent_at, email.received_at, email.created_at) DESC
         LIMIT 1)

         UNION ALL

         (SELECT activity.activity_date,
                LEFT(COALESCE(NULLIF(activity.subject, ''), NULLIF(activity.content, ''), 'JobNimbus activity'), 240),
                'JobNimbus', NULL, activity.activity_type_code,
                activity.performed_by_name, NULL, false, NULL, false
         FROM activities activity
         WHERE activity.deleted_at IS NULL
           AND activity.activity_type_code IN ('note', 'status_changed', 'status_change', 'job_status_changed')
           AND (activity.contact_jnid = cohort.contact_jnid OR activity.job_jnid = cohort.job_jnid)
         ORDER BY activity.activity_date DESC
         LIMIT 1)

         UNION ALL

         (SELECT COALESCE(outbound.sent_at, outbound.created_at),
                LEFT(COALESCE(NULLIF(outbound.subject, ''), NULLIF(outbound.body_text, ''), outbound.status, 'Campaign message'), 240),
                COALESCE(NULLIF(outbound.channel, ''), 'Campaign'),
                'outgoing', outbound.from_address,
                COALESCE(outbound.campaign_slug, outbound.provider, 'Campaign'),
                outbound.status, false, NULL, true
         FROM campaign_outbound_messages outbound
         WHERE outbound.contact_jnid = cohort.contact_jnid OR outbound.job_jnid = cohort.job_jnid
         ORDER BY COALESCE(outbound.sent_at, outbound.created_at) DESC
         LIMIT 1)

         UNION ALL

         (SELECT inbound.created_at,
                LEFT(COALESCE(NULLIF(inbound.subject, ''), NULLIF(inbound.body_text, ''), inbound.intent, 'Campaign reply'), 240),
                CASE WHEN inbound.phone IS NULL THEN 'Email' ELSE 'SMS' END,
                'incoming', inbound.to_address, cohort.name,
                inbound.intent, false, NULL, false
         FROM campaign_inbound_messages inbound
         WHERE inbound.contact_jnid = cohort.contact_jnid OR inbound.job_jnid = cohort.job_jnid
         ORDER BY inbound.created_at DESC
         LIMIT 1)
       ) event
       ORDER BY event.last_at DESC NULLS LAST
       LIMIT 1
     ) latest ON true
     ORDER BY latest.last_at DESC NULLS LAST, cohort.name
     LIMIT $4 OFFSET $5`,
    [statuses, recordTypes, search, limit, offset]
  );
}

async function loadGeneralRows(
  search: string,
  limit: number,
  offset: number
): Promise<InboxDatabaseRow[]> {
  return query<InboxDatabaseRow>(
    `WITH recent AS (
       SELECT contact_jnid, job_jnid, sent_at AS last_at
       FROM sms_messages
       WHERE sent_at >= NOW() - INTERVAL '90 days' AND contact_jnid IS NOT NULL
       UNION ALL
       SELECT contact_jnid, job_jnid, started_at
       FROM calls
       WHERE started_at >= NOW() - INTERVAL '90 days' AND contact_jnid IS NOT NULL
       UNION ALL
       SELECT contact_jnid, job_jnid, COALESCE(sent_at, received_at, created_at)
       FROM emails
       WHERE COALESCE(sent_at, received_at, created_at) >= NOW() - INTERVAL '90 days'
         AND contact_jnid IS NOT NULL
     ),
     contacts_recent AS (
       SELECT DISTINCT ON (recent.contact_jnid)
         recent.contact_jnid,
         recent.job_jnid,
         recent.last_at
       FROM recent
       ORDER BY recent.contact_jnid, recent.last_at DESC
     )
     SELECT
       c.jnid AS contact_jnid,
       contacts_recent.job_jnid,
       COALESCE(NULLIF(c.display_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), 'Unknown homeowner') AS name,
       c.address_line1 AS street,
       COALESCE(c.mobile_phone, c.home_phone, c.work_phone) AS phone,
       c.email,
       c.status_name AS status,
       999 AS status_order,
       c.sales_rep_name AS sales_rep,
       NULL::text AS campaign,
       latest.last_at,
       latest.preview,
       latest.channel,
       latest.direction,
       latest.line,
       latest.sender,
       latest.event_status,
       latest.is_voicemail,
       latest.duration_seconds,
       false AS automated
     FROM contacts_recent
     JOIN contacts c ON c.jnid = contacts_recent.contact_jnid
     LEFT JOIN LATERAL (
       SELECT event.*
       FROM (
         (SELECT s.sent_at AS last_at,
                LEFT(COALESCE(s.message_text, '(media message)'), 240) AS preview,
                'SMS'::text AS channel, s.direction::text AS direction,
                COALESCE(line.name, line.phone_number_formatted, s.phone_number_id)::text AS line,
                CASE WHEN s.direction = 'outgoing' THEN COALESCE(op_user.name, 'You') ELSE c.display_name END::text AS sender,
                s.status::text AS event_status, false AS is_voicemail,
                NULL::integer AS duration_seconds
         FROM sms_messages s
         LEFT JOIN openphone_phone_numbers line ON line.phone_number_id = s.phone_number_id
         LEFT JOIN openphone_users op_user ON op_user.openphone_user_id = s.openphone_user_id
         WHERE s.deleted_at IS NULL AND s.contact_jnid = c.jnid
         ORDER BY s.sent_at DESC LIMIT 1)
         UNION ALL
         (SELECT call.started_at,
                LEFT(COALESCE(NULLIF(call.voicemail_transcript, ''), NULLIF(call.transcript, ''), call.status, 'Call'), 240),
                'Call', call.direction,
                COALESCE(line.name, line.phone_number_formatted, call.phone_number_id),
                CASE WHEN call.direction = 'outbound' THEN COALESCE(op_user.name, 'You') ELSE c.display_name END,
                call.status, COALESCE(call.is_voicemail, false), call.duration_seconds
         FROM calls call
         LEFT JOIN openphone_phone_numbers line ON line.phone_number_id = call.phone_number_id
         LEFT JOIN openphone_users op_user ON op_user.openphone_user_id = call.openphone_user_id
         WHERE call.deleted_at IS NULL AND call.contact_jnid = c.jnid
         ORDER BY call.started_at DESC LIMIT 1)
         UNION ALL
         (SELECT COALESCE(email.sent_at, email.received_at, email.created_at),
                LEFT(COALESCE(NULLIF(email.snippet, ''), NULLIF(email.subject, ''), 'Email'), 240),
                'Email', email.direction, email.monitored_mailbox,
                CASE WHEN email.direction = 'outbound' THEN COALESCE(email.from_name, email.monitored_mailbox, 'You') ELSE COALESCE(email.from_name, c.display_name) END,
                email.processing_status, false, NULL
         FROM emails email
         WHERE email.contact_jnid = c.jnid
         ORDER BY COALESCE(email.sent_at, email.received_at, email.created_at) DESC LIMIT 1)
       ) event
       ORDER BY event.last_at DESC NULLS LAST
       LIMIT 1
     ) latest ON true
     WHERE c.deleted_at IS NULL
       AND COALESCE(c.display_name, '') !~* '\\mtest\\M'
       AND (
         $1::text = ''
         OR COALESCE(c.display_name, '') ILIKE '%' || $1 || '%'
         OR COALESCE(c.address_line1, '') ILIKE '%' || $1 || '%'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM jobs j
         WHERE j.primary_contact_jnid = c.jnid
           AND j.deleted_at IS NULL
           AND COALESCE(j.is_active, true) = true
           AND COALESCE(j.is_archived, false) = false
           AND (
             (j.record_type_name = 'Insurance' AND j.status_name = ANY($2::text[]))
             OR (
               j.record_type_name IN ('Retail', 'Repairs')
               AND j.status_name = ANY($3::text[])
             )
           )
       )
     ORDER BY contacts_recent.last_at DESC
     LIMIT $4 OFFSET $5`,
    [
      search,
      [...INSURANCE_STATUSES],
      [...SPEED_TO_LEAD_STATUSES, ...SALES_FOLLOW_UP_STATUSES],
      limit,
      offset,
    ]
  );
}

async function loadWorkspaceCounts(): Promise<Record<WorkspaceKey, number>> {
  const rows = await query<{ workspace: WorkspaceKey; count: string }>(
    `WITH eligible AS (
       SELECT j.jnid, j.record_type_name, j.status_name
       FROM jobs j
       LEFT JOIN contacts c
         ON c.jnid = j.primary_contact_jnid
        AND c.deleted_at IS NULL
       WHERE j.deleted_at IS NULL
         AND COALESCE(j.is_active, true) = true
         AND COALESCE(j.is_archived, false) = false
         AND ${NOT_TEST_JOB_SQL}
     )
     SELECT 'speed_to_lead'::text AS workspace, COUNT(*)::text AS count
     FROM eligible
     WHERE record_type_name IN ('Retail', 'Repairs')
       AND status_name = ANY($1::text[])
     UNION ALL
     SELECT 'sales_follow_up', COUNT(*)::text
     FROM eligible
     WHERE record_type_name IN ('Retail', 'Repairs')
       AND status_name = ANY($2::text[])
     UNION ALL
     SELECT 'insurance', COUNT(*)::text
     FROM eligible
     WHERE record_type_name = 'Insurance'
       AND status_name = ANY($3::text[])
     UNION ALL
     SELECT 'general', COUNT(DISTINCT recent.contact_jnid)::text
     FROM (
       SELECT contact_jnid FROM sms_messages
       WHERE sent_at >= NOW() - INTERVAL '90 days' AND contact_jnid IS NOT NULL
       UNION
       SELECT contact_jnid FROM calls
       WHERE started_at >= NOW() - INTERVAL '90 days' AND contact_jnid IS NOT NULL
       UNION
       SELECT contact_jnid FROM emails
       WHERE COALESCE(sent_at, received_at, created_at) >= NOW() - INTERVAL '90 days'
         AND contact_jnid IS NOT NULL
     ) recent
     JOIN contacts recent_contact
       ON recent_contact.jnid = recent.contact_jnid
      AND recent_contact.deleted_at IS NULL
     WHERE COALESCE(recent_contact.display_name, '') !~* '\\mtest\\M'
       AND NOT EXISTS (
         SELECT 1
         FROM jobs active_job
         WHERE active_job.primary_contact_jnid = recent.contact_jnid
           AND active_job.deleted_at IS NULL
           AND COALESCE(active_job.is_active, true) = true
           AND COALESCE(active_job.is_archived, false) = false
           AND (
             (active_job.record_type_name = 'Insurance' AND active_job.status_name = ANY($3::text[]))
             OR (
               active_job.record_type_name IN ('Retail', 'Repairs')
               AND active_job.status_name = ANY($4::text[])
             )
           )
       )`,
    [
      [...SPEED_TO_LEAD_STATUSES],
      [...SALES_FOLLOW_UP_STATUSES],
      [...INSURANCE_STATUSES],
      [...SPEED_TO_LEAD_STATUSES, ...SALES_FOLLOW_UP_STATUSES],
    ]
  );
  return {
    speed_to_lead: Number(
      rows.find((row) => row.workspace === "speed_to_lead")?.count ?? 0
    ),
    insurance: Number(
      rows.find((row) => row.workspace === "insurance")?.count ?? 0
    ),
    sales_follow_up: Number(
      rows.find((row) => row.workspace === "sales_follow_up")?.count ?? 0
    ),
    general: Number(
      rows.find((row) => row.workspace === "general")?.count ?? 0
    ),
  };
}

async function loadWorkspaceAttentionCounts(): Promise<
  Record<WorkspaceKey, number>
> {
  const rows = await query<{ workspace: WorkspaceKey; count: string }>(
    `WITH eligible AS (
       SELECT
         j.jnid AS job_jnid,
         COALESCE(j.primary_contact_jnid, j.jnid) AS contact_jnid,
         j.record_type_name,
         j.status_name
       FROM jobs j
       LEFT JOIN contacts c
         ON c.jnid = j.primary_contact_jnid
        AND c.deleted_at IS NULL
       WHERE j.deleted_at IS NULL
         AND COALESCE(j.is_active, true) = true
         AND COALESCE(j.is_archived, false) = false
         AND ${NOT_TEST_JOB_SQL}
     ),
     assignments AS (
       SELECT 'speed_to_lead'::text workspace, *
       FROM eligible
       WHERE record_type_name IN ('Retail', 'Repairs')
         AND status_name = ANY($1::text[])
       UNION ALL
       SELECT 'sales_follow_up', *
       FROM eligible
       WHERE record_type_name IN ('Retail', 'Repairs')
         AND status_name = ANY($2::text[])
       UNION ALL
       SELECT 'insurance', *
       FROM eligible
       WHERE record_type_name = 'Insurance'
         AND status_name = ANY($3::text[])
     ),
     cohort AS (
       SELECT DISTINCT ON (workspace, contact_jnid)
         workspace, contact_jnid, job_jnid
       FROM assignments
       ORDER BY workspace, contact_jnid, job_jnid
     ),
     attention AS (
       SELECT cohort.workspace, cohort.contact_jnid,
         latest.direction, latest.automated
       FROM cohort
       LEFT JOIN LATERAL (
         SELECT event.direction, event.automated
         FROM (
           (SELECT s.direction::text AS direction, false AS automated, s.sent_at AS occurred_at
            FROM sms_messages s
            WHERE s.deleted_at IS NULL
              AND (s.contact_jnid = cohort.contact_jnid OR s.job_jnid = cohort.job_jnid)
            ORDER BY s.sent_at DESC LIMIT 1)
           UNION ALL
           (SELECT call.direction, false, call.started_at
            FROM calls call
            WHERE call.deleted_at IS NULL
              AND (call.contact_jnid = cohort.contact_jnid OR call.job_jnid = cohort.job_jnid)
            ORDER BY call.started_at DESC LIMIT 1)
           UNION ALL
           (SELECT email.direction, false, COALESCE(email.sent_at, email.received_at, email.created_at)
            FROM emails email
            WHERE email.contact_jnid = cohort.contact_jnid OR email.job_jnid = cohort.job_jnid
            ORDER BY COALESCE(email.sent_at, email.received_at, email.created_at) DESC LIMIT 1)
           UNION ALL
           (SELECT 'outgoing', true, COALESCE(outbound.sent_at, outbound.created_at)
            FROM campaign_outbound_messages outbound
            WHERE outbound.contact_jnid = cohort.contact_jnid OR outbound.job_jnid = cohort.job_jnid
            ORDER BY COALESCE(outbound.sent_at, outbound.created_at) DESC LIMIT 1)
           UNION ALL
           (SELECT 'incoming', false, inbound.created_at
            FROM campaign_inbound_messages inbound
            WHERE inbound.contact_jnid = cohort.contact_jnid OR inbound.job_jnid = cohort.job_jnid
            ORDER BY inbound.created_at DESC LIMIT 1)
         ) event
         ORDER BY event.occurred_at DESC NULLS LAST
         LIMIT 1
       ) latest ON true
     )
     SELECT workspace, COUNT(*) FILTER (
       WHERE direction IN ('incoming', 'inbound') OR automated
     )::text AS count
     FROM attention
     GROUP BY workspace
     UNION ALL
     SELECT 'general', COUNT(DISTINCT recent.contact_jnid)::text
     FROM (
       SELECT contact_jnid FROM sms_messages
       WHERE sent_at >= NOW() - INTERVAL '90 days'
         AND direction = 'incoming' AND contact_jnid IS NOT NULL
       UNION
       SELECT contact_jnid FROM calls
       WHERE started_at >= NOW() - INTERVAL '90 days'
         AND direction IN ('incoming', 'inbound') AND contact_jnid IS NOT NULL
       UNION
       SELECT contact_jnid FROM emails
       WHERE COALESCE(sent_at, received_at, created_at) >= NOW() - INTERVAL '90 days'
         AND direction = 'inbound' AND contact_jnid IS NOT NULL
     ) recent
     JOIN contacts recent_contact
       ON recent_contact.jnid = recent.contact_jnid
      AND recent_contact.deleted_at IS NULL
     WHERE COALESCE(recent_contact.display_name, '') !~* '\\mtest\\M'
       AND NOT EXISTS (
         SELECT 1
         FROM jobs active_job
         WHERE active_job.primary_contact_jnid = recent.contact_jnid
           AND active_job.deleted_at IS NULL
           AND COALESCE(active_job.is_active, true) = true
           AND COALESCE(active_job.is_archived, false) = false
           AND (
             (active_job.record_type_name = 'Insurance' AND active_job.status_name = ANY($3::text[]))
             OR (
               active_job.record_type_name IN ('Retail', 'Repairs')
               AND active_job.status_name = ANY($4::text[])
             )
           )
       )`,
    [
      [...SPEED_TO_LEAD_STATUSES],
      [...SALES_FOLLOW_UP_STATUSES],
      [...INSURANCE_STATUSES],
      [...SPEED_TO_LEAD_STATUSES, ...SALES_FOLLOW_UP_STATUSES],
    ]
  );
  return {
    speed_to_lead: Number(
      rows.find((row) => row.workspace === "speed_to_lead")?.count ?? 0
    ),
    insurance: Number(
      rows.find((row) => row.workspace === "insurance")?.count ?? 0
    ),
    sales_follow_up: Number(
      rows.find((row) => row.workspace === "sales_follow_up")?.count ?? 0
    ),
    general: Number(
      rows.find((row) => row.workspace === "general")?.count ?? 0
    ),
  };
}

export async function getInbox(
  workspace: WorkspaceKey,
  options: {
    search: string;
    page: number;
    pageSize: number;
    open: "open" | "done" | "any";
    unread: boolean;
    unresponded: boolean;
    board: boolean;
  }
): Promise<InboxResponse> {
  const warnings: InboxResponse["warnings"] = [];
  const limit = options.board ? 300 : Math.min(options.pageSize, 100);
  const offset = options.board ? 0 : options.page * limit;
  let databaseRows: InboxDatabaseRow[] = [];
  let counts: Record<WorkspaceKey, number> = {
    speed_to_lead: 0,
    insurance: 0,
    sales_follow_up: 0,
    general: 0,
  };
  let attentionCounts: Record<WorkspaceKey, number> = {
    speed_to_lead: 0,
    insurance: 0,
    sales_follow_up: 0,
    general: 0,
  };

  const [rowResult, countResult, attentionResult] = await Promise.allSettled([
    workspace === "general"
      ? loadGeneralRows(options.search, limit + 1, offset)
      : loadJobWorkspaceRows(workspace, options.search, limit + 1, offset),
    loadWorkspaceCounts(),
    loadWorkspaceAttentionCounts(),
  ]);

  if (rowResult.status === "fulfilled") {
    databaseRows = rowResult.value;
  } else {
    logServerError(`[Inbox] ${workspace} rows failed`, rowResult.reason);
    warnings.push({
      source: workspace,
      message: `${WORKSPACE_LABELS[workspace]} conversations are temporarily unavailable.`,
    });
  }
  if (countResult.status === "fulfilled") {
    counts = countResult.value;
  } else {
    logServerError("[Inbox] workspace counts failed", countResult.reason);
    warnings.push({
      source: "counts",
      message: "Workspace counts are temporarily unavailable.",
    });
  }
  if (attentionResult.status === "fulfilled") {
    attentionCounts = attentionResult.value;
  } else {
    logServerError(
      "[Inbox] workspace attention counts failed",
      attentionResult.reason
    );
    warnings.push({
      source: "attention_counts",
      message: "Attention counts are temporarily unavailable.",
    });
  }

  let rows = databaseRows.map(mapRow);
  if (options.open === "open") rows = rows.filter((row) => row.unresponded);
  if (options.open === "done") rows = rows.filter((row) => !row.unresponded);
  if (options.unread) rows = rows.filter((row) => row.unread);
  if (options.unresponded) rows = rows.filter((row) => row.unresponded);

  const hasMore = databaseRows.length > limit;
  rows = rows.slice(0, limit);
  const observedColumns = new Map<
    string,
    { status: string; order: number; count: number }
  >();
  for (const row of rows) {
    if (!row.status) continue;
    const existing = observedColumns.get(row.status);
    observedColumns.set(row.status, {
      status: row.status,
      order: Math.min(existing?.order ?? row.statusOrder, row.statusOrder),
      count: (existing?.count ?? 0) + 1,
    });
  }
  const columns =
    observedColumns.size > 0
      ? [...observedColumns.values()].sort(
          (left, right) => left.order - right.order
        )
      : statusesForWorkspace(workspace).map((status, order) => ({
          status,
          order,
          count: 0,
        }));
  const summaries: WorkspaceSummary[] = (
    Object.keys(WORKSPACE_LABELS) as WorkspaceKey[]
  ).map((key) => ({
    key,
    label: WORKSPACE_LABELS[key],
    count: counts[key],
    attentionCount: attentionCounts[key],
  }));

  return {
    workspaces: summaries,
    rows,
    columns,
    total: counts[workspace],
    page: options.page,
    pageSize: limit,
    hasMore,
    warnings,
  };
}
