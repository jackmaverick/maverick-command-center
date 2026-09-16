import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getDateRange, isValidPeriodKey, toUnixSeconds, type PeriodKey } from "@/lib/dates";

const META_ACCOUNT_ID = "act_1782311009876417";
const ROOF_IGNITE_SOURCE = "Roof Ignite - Meta Ads";
const APPOINTMENT_SET_STATUSES = ["719", "884", "973", "1140", "1060", "908"];
const APPOINTMENT_RAN_STATUSES = ["1103", "1104", "1105", "1141", "1062"];

interface MetaCampaignRow { campaign_id: string | null; campaign_name: string | null; spend: string; impressions: string; clicks: string; link_clicks: string; landing_page_views: string; website_leads: string; }
interface FunnelRow { crm_leads: string; appointments_set: string; appointments_ran: string; estimates_sent: string; approved_estimates: string; confirmed_signed: string; invoice_jobs: string; invoiced_revenue: string; material_covered_invoice_jobs: string; material_cost: string; }
interface SyncRow { completed_at: string | null; status: string; window_start: string; window_end: string; }
interface PricingRow { management_fee_rate: string; estimated_appointment_fee: string | null; }
interface AgencySummaryRow { paid_agency_spend: string; agency_bookings: string; billed_management_fee: string; }
interface AgencyEventRow { cost_type: string; amount: string; paid_at: string | null; service_start: string | null; service_end: string | null; booking_count: string; invoice_number: string | null; receipt_number: string | null; notes: string | null; }

const number = (value: string | null | undefined) => Number(value || 0);
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

export async function GET(request: NextRequest) {
  const periodParam = (new URL(request.url).searchParams.get("period") ?? "all") as PeriodKey;
  const period = isValidPeriodKey(periodParam) ? periodParam : "all";
  const range = getDateRange(period);
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);
  const startUnix = toUnixSeconds(range.start);
  const endUnix = toUnixSeconds(range.end);

  try {
    const [campaignRows, funnelRows, syncRows, pricingRows, agencySummaryRows, agencyEvents] = await Promise.all([
      query<MetaCampaignRow>(
        `SELECT campaign_id, campaign_name, COALESCE(SUM(spend), 0)::text AS spend,
                COALESCE(SUM(impressions), 0)::text AS impressions, COALESCE(SUM(clicks), 0)::text AS clicks,
                COALESCE(SUM(link_clicks), 0)::text AS link_clicks, COALESCE(SUM(landing_page_views), 0)::text AS landing_page_views,
                COALESCE(SUM(website_leads), 0)::text AS website_leads
           FROM meta_ads_daily_insights
          WHERE account_id = $1 AND report_level = 'campaign' AND date_start BETWEEN $2::date AND $3::date
          GROUP BY campaign_id, campaign_name ORDER BY SUM(spend) DESC`,
        [META_ACCOUNT_ID, startDate, endDate],
      ),
      query<FunnelRow>(
        `WITH cohort AS (
           SELECT j.jnid FROM jobs j
            WHERE LOWER(TRIM(COALESCE(j.source_name, ''))) = LOWER($1)
              AND j.jn_date_created BETWEEN $2 AND $3
              AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
         ), status_events AS (
           SELECT DISTINCT a.job_jnid, a.to_status::text FROM activities a JOIN cohort c ON c.jnid = a.job_jnid
            WHERE a.activity_type_code = 'status_changed'
         ), estimate_funnel AS (
           SELECT e.job_jnid,
             BOOL_OR(COALESCE(e.status_name, '') IN ('Sent', 'Approved') OR e.date_signed IS NOT NULL OR COALESCE(e.esigned, false)) AS estimate_sent,
             BOOL_OR(COALESCE(e.status_name, '') = 'Approved' OR e.date_signed IS NOT NULL OR COALESCE(e.esigned, false)) AS approved_estimate,
             BOOL_OR(e.date_signed IS NOT NULL OR COALESCE(e.esigned, false)) AS confirmed_signed
           FROM estimates e JOIN cohort c ON c.jnid = e.job_jnid GROUP BY e.job_jnid
         ), invoice_funnel AS (
           SELECT i.job_jnid, SUM(i.total) AS revenue FROM invoices i JOIN cohort c ON c.jnid = i.job_jnid
            WHERE i.is_active = true AND COALESCE(i.status_name, i.status::text, '') IN ('Sent', 'Open', 'Closed') GROUP BY i.job_jnid
         ), material_funnel AS (
           SELECT mi.job_jnid, SUM(mi.total_amount) AS material_cost FROM mat_invoices mi JOIN cohort c ON c.jnid = mi.job_jnid GROUP BY mi.job_jnid
         )
         SELECT (SELECT COUNT(*) FROM cohort)::text AS crm_leads,
           (SELECT COUNT(DISTINCT job_jnid) FROM status_events WHERE to_status = ANY($4::text[]))::text AS appointments_set,
           (SELECT COUNT(DISTINCT job_jnid) FROM status_events WHERE to_status = ANY($5::text[]))::text AS appointments_ran,
           (SELECT COUNT(*) FROM estimate_funnel WHERE estimate_sent)::text AS estimates_sent,
           (SELECT COUNT(*) FROM estimate_funnel WHERE approved_estimate)::text AS approved_estimates,
           (SELECT COUNT(*) FROM estimate_funnel WHERE confirmed_signed)::text AS confirmed_signed,
           (SELECT COUNT(*) FROM invoice_funnel)::text AS invoice_jobs,
           COALESCE((SELECT SUM(revenue) FROM invoice_funnel), 0)::text AS invoiced_revenue,
           (SELECT COUNT(*) FROM material_funnel mf JOIN invoice_funnel i ON i.job_jnid = mf.job_jnid)::text AS material_covered_invoice_jobs,
           COALESCE((SELECT SUM(material_cost) FROM material_funnel), 0)::text AS material_cost`,
        [ROOF_IGNITE_SOURCE, startUnix, endUnix, APPOINTMENT_SET_STATUSES, APPOINTMENT_RAN_STATUSES],
      ),
      query<SyncRow>(`SELECT completed_at::text, status, window_start::text, window_end::text FROM meta_ads_sync_runs WHERE account_id = $1 ORDER BY completed_at DESC NULLS LAST LIMIT 1`, [META_ACCOUNT_ID]),
      query<PricingRow>(`SELECT management_fee_rate::text, estimated_appointment_fee::text FROM meta_ads_agency_pricing_rules WHERE account_id = $1 AND active ORDER BY effective_from DESC LIMIT 1`, [META_ACCOUNT_ID]),
      query<AgencySummaryRow>(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at BETWEEN $2::date AND $3::date), 0)::text AS paid_agency_spend,
                COALESCE(SUM(booking_count) FILTER (WHERE status <> 'void' AND service_start <= $3::date AND service_end >= $2::date), 0)::text AS agency_bookings,
                COALESCE(SUM(management_fee_component) FILTER (WHERE status <> 'void' AND service_start <= $3::date AND service_end >= $2::date), 0)::text AS billed_management_fee
           FROM meta_ads_agency_cost_events WHERE account_id = $1`,
        [META_ACCOUNT_ID, startDate, endDate],
      ),
      query<AgencyEventRow>(
        `SELECT cost_type, amount::text, paid_at::text, service_start::text, service_end::text,
                booking_count::text, invoice_number, receipt_number, notes
           FROM meta_ads_agency_cost_events
          WHERE account_id = $1 AND status = 'paid' AND paid_at BETWEEN $2::date AND $3::date
          ORDER BY paid_at DESC, created_at DESC`,
        [META_ACCOUNT_ID, startDate, endDate],
      ),
    ]);

    const totals = campaignRows.reduce((total, row) => ({
      spend: total.spend + number(row.spend), impressions: total.impressions + number(row.impressions),
      clicks: total.clicks + number(row.clicks), linkClicks: total.linkClicks + number(row.link_clicks),
      landingPageViews: total.landingPageViews + number(row.landing_page_views), metaLeads: total.metaLeads + number(row.website_leads),
    }), { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, landingPageViews: 0, metaLeads: 0 });
    const funnel = funnelRows[0];
    const costs = agencySummaryRows[0];
    const pricing = pricingRows[0];
    const crmLeads = number(funnel?.crm_leads);
    const appointmentsSet = number(funnel?.appointments_set);
    const agencyBookings = number(costs?.agency_bookings);
    const revenue = number(funnel?.invoiced_revenue);
    const paidAgencySpend = number(costs?.paid_agency_spend);
    const managementRate = number(pricing?.management_fee_rate);
    const estimatedAppointmentFee = pricing?.estimated_appointment_fee == null ? null : number(pricing.estimated_appointment_fee);
    const expectedManagementFee = totals.spend * managementRate;
    const estimatedUnbilledManagementFee = Math.max(0, expectedManagementFee - number(costs?.billed_management_fee));
    const unbilledVerifiedAppointmentFees = estimatedAppointmentFee === null ? 0 : Math.max(0, appointmentsSet - agencyBookings) * estimatedAppointmentFee;
    const allInPaidSpend = totals.spend + paidAgencySpend;
    const estimatedAdditionalAgencyCost = estimatedUnbilledManagementFee + unbilledVerifiedAppointmentFees;
    const invoiceJobs = number(funnel?.invoice_jobs);
    const materialCoveredInvoiceJobs = number(funnel?.material_covered_invoice_jobs);
    const materialCost = number(funnel?.material_cost);
    const profitCoverageComplete = invoiceJobs > 0 && invoiceJobs === materialCoveredInvoiceJobs;

    return NextResponse.json({
      period: { key: period, label: range.label, start: startDate, end: endDate },
      meta: {
        accountId: META_ACCOUNT_ID, spend: round(totals.spend), impressions: totals.impressions, clicks: totals.clicks,
        linkClicks: totals.linkClicks, landingPageViews: totals.landingPageViews, websiteLeads: totals.metaLeads,
        costPerLead: totals.metaLeads ? round(totals.spend / totals.metaLeads) : null,
        ctr: totals.impressions ? round((totals.clicks / totals.impressions) * 100, 2) : null,
        campaigns: campaignRows.map((row) => {
          const spend = number(row.spend); const leads = number(row.website_leads);
          return { id: row.campaign_id, name: row.campaign_name || "Unnamed campaign", spend: round(spend), websiteLeads: leads,
            costPerLead: leads ? round(spend / leads) : null, impressions: number(row.impressions), linkClicks: number(row.link_clicks) };
        }),
      },
      funnel: { crmLeads, appointmentsSet, appointmentsRan: number(funnel?.appointments_ran), estimatesSent: number(funnel?.estimates_sent), approvedEstimates: number(funnel?.approved_estimates), confirmedSigned: number(funnel?.confirmed_signed), invoiceJobs, invoicedRevenue: round(revenue), materialCoveredInvoiceJobs, materialCost: round(materialCost), profitCoverageComplete, materialOnlyGrossProfit: profitCoverageComplete ? round(revenue - materialCost) : null },
      costs: {
        paidAgencySpend: round(paidAgencySpend), allInPaidSpend: round(allInPaidSpend), managementFeeRate: managementRate,
        expectedManagementFee: round(expectedManagementFee), billedManagementFee: round(number(costs?.billed_management_fee)),
        estimatedUnbilledManagementFee: round(estimatedUnbilledManagementFee), estimatedAppointmentFee,
        unbilledVerifiedAppointmentFees: round(unbilledVerifiedAppointmentFees), estimatedAdditionalAgencyCost: round(estimatedAdditionalAgencyCost),
        expectedAllInSpend: round(allInPaidSpend + estimatedAdditionalAgencyCost), agencyBookings,
        agencyBookingGap: agencyBookings - appointmentsSet, events: agencyEvents.map((event) => ({ ...event, amount: round(number(event.amount)), bookingCount: number(event.booking_count) })),
      },
      attribution: {
        sourceName: ROOF_IGNITE_SOURCE, unmatchedMetaLeads: Math.max(0, totals.metaLeads - crmLeads),
        crmMatchRate: totals.metaLeads ? round((crmLeads / totals.metaLeads) * 100, 1) : null,
        allInRevenueMultiple: revenue > 0 && allInPaidSpend > 0 ? round(revenue / allInPaidSpend, 2) : null,
        costPerAllInMetaLead: totals.metaLeads ? round(allInPaidSpend / totals.metaLeads) : null,
        costPerAllInCrmLead: crmLeads ? round(allInPaidSpend / crmLeads) : null,
        costPerAllInEstimate: number(funnel?.estimates_sent) ? round(allInPaidSpend / number(funnel?.estimates_sent)) : null,
        costPerMaterialOnlyProfit: profitCoverageComplete && revenue > materialCost ? round(allInPaidSpend / (revenue - materialCost)) : null,
      },
      sync: syncRows[0] || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const setupRequired = /meta_ads_(daily_insights|sync_runs|agency_cost)/i.test(message);
    return NextResponse.json({ error: setupRequired ? "The Meta analytics and agency-cost ledger has not been deployed yet." : "Unable to load Meta analytics.", setupRequired }, { status: setupRequired ? 503 : 500 });
  }
}
