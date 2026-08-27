import "server-only";

import type {
  DirectMailCampaignReport,
  DirectMailDashboardData,
  DirectMailDropReport,
  DirectMailMessageRecommendation,
} from "./types";

type QueryFn = <T>(sql: string, params?: unknown[]) => Promise<T[]>;
type DatabaseError = Error & { code?: string };

interface CampaignRow {
  campaign_id: string; campaign_slug: string; campaign_name: string; segment: string;
  campaign_status: string; drive_web_url: string | null; storm_event_code: string | null;
  storm_date: string | null; drop_count: string | number;
  unique_addresses_confirmed_mailed: string | number; confirmed_mail_touch_count: string | number;
  repeat_mail_touch_count: string | number; total_address_gaps: string | number;
  attributed_leads: string | number; confirmed_leads: string | number;
  attributed_sales: string | number; attributed_revenue: string | number;
  total_campaign_cost: string | number;
}

interface DropRow {
  drop_id: string; drop_code: string; drop_number: string | number; drop_status: string;
  campaign_name: string; planned_mail_date: string | null; postal_drop_at: string | null;
  drive_web_url: string | null; hail_age_days: string | number | null;
  source_recipient_count: string | number; eligible_recipient_count: string | number;
  packaged_recipient_count: string | number; submitted_recipient_count: string | number;
  accepted_recipient_count: string | number; addresses_confirmed_mailed: string | number;
  total_address_gaps: string | number; eligible_not_packaged: string | number;
  packaged_not_submitted: string | number; unconfirmed_after_postal_drop: string | number;
  attributed_leads: string | number; attributed_sales: string | number; attributed_revenue: string | number;
}

interface RecommendationRow {
  campaign_id: string; campaign_name: string; event_code: string; event_date: string;
  current_hail_age_days: string | number; hail_age_band: string; next_touch_number: string | number;
  rule_slug: string | null; message_lane: string | null; timing_action: string | null;
  copy_guidance: string | null; required_claims_review: string[] | null;
  prohibited_claims: string[] | null; sample_size: string | number;
  observed_response_rate: string | number | null;
}

const numeric = (value: string | number | null): number => Number(value ?? 0);
const nullableNumber = (value: string | number | null): number | null => value === null ? null : Number(value);

function mapCampaign(row: CampaignRow): DirectMailCampaignReport {
  return {
    campaignId: row.campaign_id, campaignSlug: row.campaign_slug, campaignName: row.campaign_name,
    segment: row.segment, campaignStatus: row.campaign_status, driveWebUrl: row.drive_web_url,
    stormEventCode: row.storm_event_code, stormDate: row.storm_date, dropCount: numeric(row.drop_count),
    uniqueAddressesConfirmedMailed: numeric(row.unique_addresses_confirmed_mailed),
    confirmedMailTouches: numeric(row.confirmed_mail_touch_count), repeatMailTouches: numeric(row.repeat_mail_touch_count),
    totalAddressGaps: numeric(row.total_address_gaps), attributedLeads: numeric(row.attributed_leads),
    confirmedLeads: numeric(row.confirmed_leads), attributedSales: numeric(row.attributed_sales),
    attributedRevenue: numeric(row.attributed_revenue), totalCampaignCost: numeric(row.total_campaign_cost),
  };
}

function mapDrop(row: DropRow): DirectMailDropReport {
  return {
    dropId: row.drop_id, dropCode: row.drop_code, dropNumber: numeric(row.drop_number),
    dropStatus: row.drop_status, campaignName: row.campaign_name, plannedMailDate: row.planned_mail_date,
    postalDropAt: row.postal_drop_at, driveWebUrl: row.drive_web_url, hailAgeDays: nullableNumber(row.hail_age_days),
    sourceRecipientCount: numeric(row.source_recipient_count), eligibleRecipientCount: numeric(row.eligible_recipient_count),
    packagedRecipientCount: numeric(row.packaged_recipient_count), submittedRecipientCount: numeric(row.submitted_recipient_count),
    acceptedRecipientCount: numeric(row.accepted_recipient_count), addressesConfirmedMailed: numeric(row.addresses_confirmed_mailed),
    totalAddressGaps: numeric(row.total_address_gaps), eligibleNotPackaged: numeric(row.eligible_not_packaged),
    packagedNotSubmitted: numeric(row.packaged_not_submitted), unconfirmedAfterPostalDrop: numeric(row.unconfirmed_after_postal_drop),
    attributedLeads: numeric(row.attributed_leads), attributedSales: numeric(row.attributed_sales),
    attributedRevenue: numeric(row.attributed_revenue),
  };
}

function mapRecommendation(row: RecommendationRow): DirectMailMessageRecommendation {
  const sampleSize = numeric(row.sample_size);
  return {
    campaignId: row.campaign_id, campaignName: row.campaign_name, eventCode: row.event_code,
    eventDate: row.event_date, currentHailAgeDays: numeric(row.current_hail_age_days), hailAgeBand: row.hail_age_band,
    nextTouchNumber: numeric(row.next_touch_number), ruleSlug: row.rule_slug, messageLane: row.message_lane,
    timingAction: row.timing_action, copyGuidance: row.copy_guidance,
    requiredClaimsReview: (row.required_claims_review ?? []).length > 0,
    prohibitedClaims: row.prohibited_claims ?? [],
    sampleSize, observedResponseRate: nullableNumber(row.observed_response_rate),
    evidenceStrength: sampleSize === 0 ? "no_evidence" : sampleSize < 100 ? "directional_only" : "usable_sample",
  };
}

export async function loadDirectMailDashboard(query: QueryFn): Promise<DirectMailDashboardData> {
  const [campaignRows, dropRows, recommendationRows] = await Promise.all([
    query<CampaignRow>("SELECT * FROM public.v_direct_mail_campaign_reporting ORDER BY campaign_name"),
    query<DropRow>("SELECT * FROM public.v_direct_mail_drop_reporting ORDER BY planned_mail_date DESC NULLS LAST, drop_number DESC"),
    query<RecommendationRow>("SELECT * FROM public.v_direct_mail_message_recommendations ORDER BY current_hail_age_days, campaign_name"),
  ]);
  const campaigns = campaignRows.map(mapCampaign);
  const summary = campaigns.reduce((total, row) => ({
    campaignCount: total.campaignCount + 1, dropCount: total.dropCount + row.dropCount,
    uniqueAddressesConfirmedMailed: total.uniqueAddressesConfirmedMailed + row.uniqueAddressesConfirmedMailed,
    confirmedMailTouches: total.confirmedMailTouches + row.confirmedMailTouches,
    repeatMailTouches: total.repeatMailTouches + row.repeatMailTouches,
    totalAddressGaps: total.totalAddressGaps + row.totalAddressGaps,
    attributedLeads: total.attributedLeads + row.attributedLeads,
    confirmedLeads: total.confirmedLeads + row.confirmedLeads,
    attributedSales: total.attributedSales + row.attributedSales,
    attributedRevenue: total.attributedRevenue + row.attributedRevenue,
    totalCost: total.totalCost + row.totalCampaignCost,
  }), {
    campaignCount: 0, dropCount: 0, uniqueAddressesConfirmedMailed: 0, confirmedMailTouches: 0,
    repeatMailTouches: 0, totalAddressGaps: 0, attributedLeads: 0, confirmedLeads: 0,
    attributedSales: 0, attributedRevenue: 0, totalCost: 0,
  });

  return {
    available: true, generatedAt: new Date().toISOString(),
    evidenceBoundary: "Confirmed mailed counts require recipient-level mailed or returned evidence. Requests, uploads, and vendor acceptance are not postal proof.",
    summary, campaigns, drops: dropRows.map(mapDrop), recommendations: recommendationRows.map(mapRecommendation),
  };
}

export function isDirectMailSchemaUnavailable(error: unknown): boolean {
  return ["42P01", "42703", "42883"].includes((error as DatabaseError)?.code ?? "");
}
