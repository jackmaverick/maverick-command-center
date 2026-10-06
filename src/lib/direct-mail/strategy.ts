import { mailingCosts, returnMetrics } from "./costs";
import type { WeeklyReview } from "./weekly";

export const audienceLabels = {
  job_scheduled_neighborhood: "Job scheduled neighborhood",
  general_audience: "General audience",
  other: "Other reviewed audience",
  unclassified: "Unclassified history",
} as const;

export const touchLabels = {
  first_touch: "First touch",
  resend: "Resend",
  mixed: "Mixed touch",
  unclassified: "Touch unclassified",
} as const;

type AudienceStrategy = keyof typeof audienceLabels;
type TouchType = keyof typeof touchLabels;

const audienceOrder: AudienceStrategy[] = [
  "job_scheduled_neighborhood",
  "general_audience",
  "other",
  "unclassified",
];

export function campaignStrategyPerformance(d: WeeklyReview) {
  return audienceOrder.flatMap((audience) => {
    const campaigns = d.campaigns.filter(
      (campaign) => (campaign.audienceStrategy ?? "unclassified") === audience,
    );
    if (!campaigns.length) return [];
    const requested = campaigns.reduce((sum, campaign) => sum + campaign.requested, 0);
    const leads = campaigns.reduce((sum, campaign) => sum + campaign.leads, 0);
    const invoiced = campaigns.reduce((sum, campaign) => sum + campaign.invoiced, 0);
    const costs = mailingCosts(
      d,
      campaigns.map((campaign) => campaign.id),
    );
    const touches = campaigns.reduce<Record<TouchType, number>>(
      (counts, campaign) => {
        const touch = campaign.touchType ?? "unclassified";
        counts[touch] += 1;
        return counts;
      },
      { first_touch: 0, resend: 0, mixed: 0, unclassified: 0 },
    );
    return [
      {
        audience,
        label: audienceLabels[audience],
        campaigns: campaigns.length,
        requested,
        averageRequest: Math.round(requested / campaigns.length),
        leads,
        leadsPerThousandRequested:
          requested > 0 ? (leads / requested) * 1000 : null,
        invoiced,
        revenuePerThousandRequested:
          requested > 0 ? (invoiced / requested) * 1000 : null,
        documentedCost: costs.known,
        costComplete: costs.complete,
        costCoverage: `${costs.covered} of ${costs.count}`,
        roas: returnMetrics(invoiced, null, costs.known).roas,
        touches,
      },
    ];
  });
}

export function campaignClassificationCoverage(d: WeeklyReview) {
  const classified = d.campaigns.filter(
    (campaign) =>
      (campaign.audienceStrategy ?? "unclassified") !== "unclassified" &&
      (campaign.touchType ?? "unclassified") !== "unclassified",
  ).length;
  return { classified, total: d.campaigns.length };
}

export function campaignOperatingSignal(d: WeeklyReview) {
  const rows = campaignStrategyPerformance(d);
  const scheduled = rows.find(
    (row) => row.audience === "job_scheduled_neighborhood",
  );
  const general = rows.find((row) => row.audience === "general_audience");
  if (!scheduled || !general) return null;

  const scheduledLeadsAhead =
    scheduled.leadsPerThousandRequested !== null &&
    general.leadsPerThousandRequested !== null &&
    scheduled.leadsPerThousandRequested >= general.leadsPerThousandRequested;
  const scheduledRoasAhead =
    scheduled.roas !== null &&
    general.roas !== null &&
    scheduled.roas >= general.roas;

  return {
    scheduled,
    general,
    recommendation:
      scheduledLeadsAhead && scheduledRoasAhead
        ? "Automate scheduled-neighborhood runs; use general drops for scale."
        : "Keep both lanes in the monthly plan while the performance signal develops.",
    scheduledLeadsAhead,
    scheduledRoasAhead,
  };
}
