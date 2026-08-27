import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isDirectMailSchemaUnavailable, loadDirectMailDashboard } from "./live-data";

const campaign = {
  campaign_id: "campaign-1", campaign_slug: "kensington", campaign_name: "Kensington",
  segment: "storm_hail", campaign_status: "active", drive_web_url: "https://drive.example/campaign",
  storm_event_code: "HAIL-2026-03-10", storm_date: "2026-03-10", drop_count: "2",
  unique_addresses_confirmed_mailed: "500", confirmed_mail_touch_count: "725",
  repeat_mail_touch_count: "225", total_address_gaps: "4", attributed_leads: "9",
  confirmed_leads: "3", attributed_sales: "2", attributed_revenue: "42000.50",
  total_campaign_cost: "1150.25",
};

const drop = {
  drop_id: "drop-1", drop_code: "D01", drop_number: "1", drop_status: "postal_confirmed",
  campaign_name: "Kensington", planned_mail_date: "2026-08-27", postal_drop_at: "2026-08-28T12:00:00Z",
  drive_web_url: "https://drive.example/drop", hail_age_days: "171", source_recipient_count: "504",
  eligible_recipient_count: "500", packaged_recipient_count: "500", submitted_recipient_count: "500",
  accepted_recipient_count: "500", addresses_confirmed_mailed: "500", total_address_gaps: "3",
  eligible_not_packaged: "0", packaged_not_submitted: "0", vendor_rejected_recipient_count: "3",
  unconfirmed_after_postal_drop: "0", attributed_leads: "9", attributed_sales: "2",
  attributed_revenue: "42000.50",
};

const recommendation = {
  campaign_id: "campaign-1", campaign_name: "Kensington", event_code: "HAIL-2026-03-10",
  event_date: "2026-03-10", current_hail_age_days: "171", hail_age_band: "091-180",
  next_touch_number: "3", rule_slug: "delayed-damage", message_lane: "education",
  timing_action: "review", copy_guidance: "Explain delayed storm damage.", required_claims_review: ["storm_date"],
  prohibited_claims: ["guaranteed damage"], sample_size: "99", observed_response_rate: "0.0182",
};

describe("loadDirectMailDashboard", () => {
  it("maps one snapshot-consistent database payload into evidence-bounded totals", async () => {
    const query = vi.fn().mockResolvedValueOnce([{
      dashboard: {
        global: {
          unique_addresses_confirmed_mailed: "490", confirmed_mail_touch_count: "725",
          repeat_mail_touch_count: "235", unique_due_addresses_with_gaps: "3",
          due_address_gap_instances: "4",
        },
        campaigns: [campaign],
        drops: [drop],
        recommendations: [recommendation],
      },
    }]);

    const result = await loadDirectMailDashboard(query);

    expect(result.summary).toMatchObject({
      campaignCount: 1, dropCount: 2, uniqueAddressesConfirmedMailed: 490,
      confirmedMailTouches: 725, repeatMailTouches: 235, uniqueDueAddressesWithGaps: 3,
      addressGapInstances: 4, attributedLeads: 9, confirmedLeads: 3, attributedSales: 2,
      attributedRevenue: 42000.5, totalCost: 1150.25,
    });
    expect(result.drops[0]).toMatchObject({
      addressesConfirmedMailed: 500, hailAgeDays: 171, vendorRejectedRecipientCount: 3,
    });
    expect(result.recommendations[0]).toMatchObject({
      sampleSize: 99, observedResponseRate: 0.0182, evidenceStrength: "directional_only",
    });
    const serialized = JSON.stringify(result);
    for (const piiField of [
      "mailingAddressee",
      "mailingAddress",
      "propertyAddress",
      "homeownerName",
    ]) {
      expect(serialized).not.toContain(piiField);
    }
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("v_direct_mail_global_reporting");
    expect(query.mock.calls[0][0]).toContain("v_direct_mail_campaign_reporting");
    expect(query.mock.calls[0][0]).toContain("v_direct_mail_drop_reporting");
    expect(query.mock.calls[0][0]).toContain("v_direct_mail_message_recommendations");
  });

  it("returns empty honest totals when the reporting query returns no row", async () => {
    const result = await loadDirectMailDashboard(async () => []);
    expect(result.summary.campaignCount).toBe(0);
    expect(result.summary.confirmedMailTouches).toBe(0);
    expect(result.summary.uniqueDueAddressesWithGaps).toBe(0);
    expect(result.campaigns).toEqual([]);
  });

  it("does not require claims review for an empty JSON rule list", async () => {
    const query = vi.fn().mockResolvedValueOnce([{
      dashboard: {
        global: null,
        campaigns: [],
        drops: [],
        recommendations: [{
          ...recommendation,
          campaign_name: "Evergreen", event_code: "HAIL-OLD", event_date: "2025-01-01",
          current_hail_age_days: "600", hail_age_band: "366-plus", next_touch_number: "1",
          rule_slug: "evergreen", message_lane: "evergreen_homeowner", timing_action: "retire",
          copy_guidance: "Use evergreen education.", required_claims_review: [],
          prohibited_claims: ["recent_storm"], sample_size: "0", observed_response_rate: null,
        }],
      },
    }]);

    const result = await loadDirectMailDashboard(query);
    expect(result.recommendations[0].requiredClaimsReview).toBe(false);
  });
});

describe("isDirectMailSchemaUnavailable", () => {
  it("recognizes missing relation, column, and function errors", () => {
    expect(isDirectMailSchemaUnavailable({ code: "42P01" })).toBe(true);
    expect(isDirectMailSchemaUnavailable({ code: "42703" })).toBe(true);
    expect(isDirectMailSchemaUnavailable({ code: "42883" })).toBe(true);
    expect(isDirectMailSchemaUnavailable({ code: "08006" })).toBe(false);
  });
});
