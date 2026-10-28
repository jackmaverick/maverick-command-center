import { unstable_cache } from "next/cache";
import { query } from "@/lib/db";
import { getHomeownerDetail } from "@/lib/homeowners/repository";
import type { TimelineCursor } from "@/lib/homeowners/timeline";
import { logServerError } from "@/lib/server-error";
import type {
  ConversationItem,
  ConversationItemType,
  WorkspaceKey,
} from "./types";

interface CampaignSystemRow {
  id: string;
  kind: "campaign_launched" | "campaign_completed";
  occurred_at: string;
  campaign: string;
  actor: string | null;
  disposition: string | null;
}

function normalizeDirection(
  direction: string | null
): ConversationItem["direction"] {
  if (direction === "incoming" || direction === "inbound") return "inbound";
  if (direction === "outgoing" || direction === "outbound") return "outbound";
  return "internal";
}

function itemType(channel: string, source: string): ConversationItemType {
  const normalized = channel.toLowerCase();
  if (
    normalized === "sms" ||
    normalized === "text" ||
    normalized === "text_message"
  ) {
    return "text";
  }
  if (normalized === "call") return "call";
  if (normalized === "email") return "email";
  if (source === "activities" && normalized === "note") return "note";
  return "activity";
}

const COMMUNICATION_ACTIVITY_TYPES = new Set([
  "note",
  "email",
  "text_message",
  "sms",
]);
const SYSTEM_ACTIVITY_TYPES = new Set([
  "status_changed",
  "status_change",
  "job_status_changed",
]);

export function includeThreadTimelineEvent(event: {
  source: string;
  channel: string;
}): boolean {
  if (event.source !== "activities") return true;
  return (
    COMMUNICATION_ACTIVITY_TYPES.has(event.channel) ||
    SYSTEM_ACTIVITY_TYPES.has(event.channel)
  );
}

async function buildConversationThread(
  contactJnid: string,
  workspace: WorkspaceKey,
  before: TimelineCursor | null
) {
  const detail = await getHomeownerDetail(contactJnid, before, 40);
  if (!detail) return null;
  const jobJnids = detail.jobs.map((job) => job.jobJnid);

  let campaignEvents: CampaignSystemRow[] = [];
  const warnings: Array<{ source: string; message: string }> = [];
  try {
    if (before) {
      campaignEvents = [];
    } else {
    campaignEvents = await query<CampaignSystemRow>(
    `SELECT
       enrollment.id::text || ':entered' AS id,
       'campaign_launched'::text AS kind,
       enrollment.entered_at AS occurred_at,
       campaign.name AS campaign,
       COALESCE(campaign.owner_bot, 'workflow') AS actor,
       NULL::text AS disposition
     FROM seq_enrollments enrollment
     JOIN seq_campaigns campaign ON campaign.key = enrollment.campaign_key
     WHERE enrollment.entered_at IS NOT NULL
       AND (
         enrollment.contact_jnid = $1
         OR enrollment.job_jnid = ANY($2::text[])
       )
     UNION ALL
     SELECT
       enrollment.id::text || ':exited',
       'campaign_completed',
       enrollment.exited_at,
       campaign.name,
       COALESCE(campaign.owner_bot, 'workflow'),
       enrollment.exit_reason
     FROM seq_enrollments enrollment
     JOIN seq_campaigns campaign ON campaign.key = enrollment.campaign_key
     WHERE enrollment.exited_at IS NOT NULL
       AND (
         enrollment.contact_jnid = $1
         OR enrollment.job_jnid = ANY($2::text[])
       )
     UNION ALL
     SELECT
       member.id::text || ':enrolled',
       'campaign_launched',
       member.enrolled_at,
       campaign.name,
       COALESCE(campaign.source, 'workflow'),
       NULL
     FROM marketing_automation_campaign_contacts member
     JOIN marketing_automation_campaigns campaign ON campaign.id = member.campaign_id
     WHERE member.enrolled_at IS NOT NULL
       AND (member.contact_jnid = $1 OR member.job_jnid = ANY($2::text[]))
     UNION ALL
     SELECT
       member.id::text || ':exited',
       'campaign_completed',
       member.exited_at,
       campaign.name,
       COALESCE(campaign.source, 'workflow'),
       member.exit_reason
     FROM marketing_automation_campaign_contacts member
     JOIN marketing_automation_campaigns campaign ON campaign.id = member.campaign_id
     WHERE member.exited_at IS NOT NULL
       AND (member.contact_jnid = $1 OR member.job_jnid = ANY($2::text[]))
     ORDER BY occurred_at`,
      [detail.contact.contactJnid, jobJnids]
    );
    }
  } catch (error) {
    logServerError("[Campaign Thread] campaign events failed", error);
    warnings.push({
      source: "campaign_events",
      message: "Campaign events are temporarily unavailable.",
    });
  }

  const activityItems: ConversationItem[] = detail.timeline.events
    .filter(includeThreadTimelineEvent)
    .map(
    (event) => {
      const statusEvent =
        event.source === "activities" &&
        SYSTEM_ACTIVITY_TYPES.has(event.channel);
      return {
        id: `${event.source}:${event.id}`,
        type: statusEvent ? "system" : itemType(event.channel, event.source),
        direction: statusEvent
          ? "internal"
          : normalizeDirection(event.direction),
        deliveryStatus: event.deliveryStatus,
        occurredAt: event.occurredAt,
        channel:
          event.source === "activities" && !statusEvent
            ? "JobNimbus"
            : event.channel,
        line: event.line,
        sender:
          normalizeDirection(event.direction) === "outbound"
            ? event.line ?? "You"
            : normalizeDirection(event.direction) === "inbound"
              ? detail.contact.name
              : event.line,
        preview: event.preview,
        body: event.body,
        durationSeconds: event.durationSeconds,
        systemEvent: statusEvent
          ? {
              kind: "status_changed",
              actor: event.line,
              disposition: null,
            }
          : undefined,
      };
    }
  );
  const systemItems: ConversationItem[] = campaignEvents.map((event) => ({
    id: `campaign:${event.id}`,
    type: "system",
    direction: "internal",
    deliveryStatus: null,
    occurredAt: event.occurred_at,
    channel: "Campaign",
    line: null,
    sender: event.actor,
    preview:
      event.kind === "campaign_launched"
        ? `${event.campaign} launched`
        : `${event.campaign} completed`,
    body: null,
    systemEvent: {
      kind: event.kind,
      actor: event.actor,
      disposition: event.disposition,
    },
  }));
  const items = [...activityItems, ...systemItems].sort(
    (left, right) =>
      new Date(left.occurredAt).getTime() -
      new Date(right.occurredAt).getTime()
  );

  return {
    workspace,
    homeowner: detail.contact,
    jobs: detail.jobs,
    campaigns: detail.campaigns,
    suppressions: detail.suppressions,
    items,
    notes: items.filter((item) => item.type === "note"),
    primaryJob: detail.jobs[0] ?? null,
    warnings: [...detail.sourceWarnings, ...warnings],
    nextCursor: detail.timeline.nextCursor,
  };
}

const getCachedInitialThread = unstable_cache(
  (contactJnid: string, workspace: WorkspaceKey) =>
    buildConversationThread(contactJnid, workspace, null),
  ["campaign-thread-v2a-communication"],
  { revalidate: 30 }
);

export function getConversationThread(
  contactJnid: string,
  workspace: WorkspaceKey,
  before: TimelineCursor | null = null
) {
  if (before) return buildConversationThread(contactJnid, workspace, before);
  return getCachedInitialThread(contactJnid, workspace);
}
