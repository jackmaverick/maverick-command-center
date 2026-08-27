export interface DirectMailSummary {
  campaignCount: number;
  dropCount: number;
  uniqueAddressesConfirmedMailed: number;
  confirmedMailTouches: number;
  repeatMailTouches: number;
  uniqueDueAddressesWithGaps: number;
  addressGapInstances: number;
  attributedLeads: number;
  confirmedLeads: number;
  attributedSales: number;
  attributedRevenue: number;
  totalCost: number;
}

export interface DirectMailCampaignReport {
  campaignId: string;
  campaignSlug: string;
  campaignName: string;
  segment: string;
  campaignStatus: string;
  driveWebUrl: string | null;
  stormEventCode: string | null;
  stormDate: string | null;
  dropCount: number;
  uniqueAddressesConfirmedMailed: number;
  confirmedMailTouches: number;
  repeatMailTouches: number;
  totalAddressGaps: number;
  attributedLeads: number;
  confirmedLeads: number;
  attributedSales: number;
  attributedRevenue: number;
  totalCampaignCost: number;
}

export interface DirectMailDropReport {
  dropId: string;
  dropCode: string;
  dropNumber: number;
  dropStatus: string;
  campaignName: string;
  plannedMailDate: string | null;
  postalDropAt: string | null;
  driveWebUrl: string | null;
  hailAgeDays: number | null;
  sourceRecipientCount: number;
  eligibleRecipientCount: number;
  packagedRecipientCount: number;
  submittedRecipientCount: number;
  acceptedRecipientCount: number;
  addressesConfirmedMailed: number;
  totalAddressGaps: number;
  eligibleNotPackaged: number;
  packagedNotSubmitted: number;
  vendorRejectedRecipientCount: number;
  unconfirmedAfterPostalDrop: number;
  attributedLeads: number;
  attributedSales: number;
  attributedRevenue: number;
}

export interface DirectMailMessageRecommendation {
  campaignId: string;
  campaignName: string;
  eventCode: string;
  eventDate: string;
  currentHailAgeDays: number;
  hailAgeBand: string;
  nextTouchNumber: number;
  ruleSlug: string | null;
  messageLane: string | null;
  timingAction: string | null;
  copyGuidance: string | null;
  requiredClaimsReview: boolean;
  prohibitedClaims: string[];
  sampleSize: number;
  observedResponseRate: number | null;
  evidenceStrength: "no_evidence" | "directional_only" | "usable_sample";
}

export interface DirectMailDashboardData {
  available: true;
  generatedAt: string;
  evidenceBoundary: string;
  summary: DirectMailSummary;
  campaigns: DirectMailCampaignReport[];
  drops: DirectMailDropReport[];
  recommendations: DirectMailMessageRecommendation[];
}

export interface DirectMailDashboardUnavailable {
  available: false;
  code: "schema_unavailable" | "configuration_unavailable" | "query_failed";
  message: string;
}

export type DirectMailDashboardResponse = DirectMailDashboardData | DirectMailDashboardUnavailable;
