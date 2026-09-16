import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getDateRange, isValidPeriodKey, toUnixSeconds, type PeriodKey } from "@/lib/dates";

const META_ACCOUNT_ID = "act_1782311009876417";
const ROOF_IGNITE_SOURCE = "Roof Ignite - Meta Ads";
const APPOINTMENT_SET_STATUSES = ["719", "884", "973", "1140", "1060", "908"];
const APPOINTMENT_RAN_STATUSES = ["1103", "1104", "1105", "1141", "1062"];

interface MetaCampaignRow {
  campaign_id: string | null;
  campaign_name: string | null;
  spend: string;
  impressions: string;
  clicks: string;
  link_clicks: string;
  landing_page_views: string;
  website_leads: string;
}

interface FunnelRow {
  crm_leads: string;
  appointments_set: string;
  appointments_ran: string;
  estimates_sent: string;
  approved_estimates: string;
  confirmed_signed: string;
  invoice_jobs: string;
  invoiced_revenue: string;
  material_covered_invoice_jobs: string;
  material_cost: string;
}

interface SyncRow {
  completed_at: string | null;
  status: string;
  window_start: string;
  window_end: string;
}

const toNumber = (value: string | null | undefined) => Number(value || 0);
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

export async function GET(request: NextRequest) {
  const periodParam = (new URL(request.url).searchParams.get("period") ?? "month") as PeriodKey;
  const period = isValidPeriodKey(periodParam) ? periodParam : "month";
  const range = getDateRange(period);
  const startUnix = toUnixSeconds(range.start);
  const endUnix = toUnixSeconds(range.end);
  const startDate = range.start.toISOString().slice(0, 10);
  const endDate = range.end.toISOString().slice(0, 10);

  try {
    const [campaignRows, funnelRows, syncRows] = await Promise.all([
      query<MetaCampaignRow>(
        `SELECT campaign_id, campaign_name,
                COALESCE(SUM(spend), 0)::text AS spend,
                COALESCE(SUM(impressions), 0)::text AS impressions,
                COALESCE(SUM(clicks), 0)::text AS clicks,
                COALESCE(SUM(link_clicks), 0)::text AS link_clicks,
                COALESCE(SUM(landing_page_views), 0)::text AS landing_page_views,
                COALESCE(SUM(website_leads), 0)::text AS website_leads
           FROM meta_ads_daily_insights
          WHERE account_id = $1
            AND report_level = 'campaign'
            AND date_start >= $2::date
            AND date_start <= $3::date
          GROUP BY campaign_id, campaign_name
          ORDER BY SUM(spend) DESC`,
        [META_ACCOUNT_ID, startDate, endDate],
      ),
      query<FunnelRow>(
        `WITH cohort AS (
           SELECT j.jnid
             FROM jobs j
            WHERE LOWER(TRIM(COALESCE(j.source_name, ''))) = LOWER($1)
              AND j.jn_date_created >= $2
              AND j.jn_date_created <= $3
              AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
         ), status_events AS (
           SELECT DISTINCT a.job_jnid, a.to_status::text
             FROM activities a
             JOIN cohort c ON c.jnid = a.job_jnid
            WHERE a.activity_type_code = 'status_changed'
         ), estimate_funnel AS (
           SELECT e.job_jnid,
                  BOOL_OR(COALESCE(e.status_name, '') IN ('Sent', 'Approved')
                          OR e.date_signed IS NOT NULL OR COALESCE(e.esigned, false)) AS estimate_sent,
                  BOOL_OR(COALESCE(e.status_name, '') = 'Approved'
                          OR e.date_signed IS NOT NULL OR COALESCE(e.esigned, false)) AS approved_estimate,
                  BOOL_OR(e.date_signed IS NOT NULL OR COALESCE(e.esigned, false)) AS confirmed_signed
             FROM estimates e
             JOIN cohort c ON c.jnid = e.job_jnid
            GROUP BY e.job_jnid
         ), invoice_funnel AS (
           SELECT i.job_jnid, SUM(i.total) AS revenue
             FROM invoices i
             JOIN cohort c ON c.jnid = i.job_jnid
            WHERE i.is_active = true
              AND COALESCE(i.status_name, i.status::text, '') IN ('Sent', 'Open', 'Closed')
            GROUP BY i.job_jnid
         ), material_funnel AS (
           SELECT mi.job_jnid, SUM(mi.total_amount) AS material_cost
             FROM mat_invoices mi
             JOIN cohort c ON c.jnid = mi.job_jnid
            GROUP BY mi.job_jnid
         )
         SELECT
           (SELECT COUNT(*) FROM cohort)::text AS crm_leads,
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
      query<SyncRow>(
        `SELECT completed_at::text, status, window_start::text, window_end::text
           FROM meta_ads_sync_runs
          WHERE account_id = $1
          ORDER BY completed_at DESC NULLS LAST
          LIMIT 1`,
        [META_ACCOUNT_ID],
      ),
    ]);

    const totals = campaignRows.reduce(
      (total, row) => ({
        spend: total.spend + toNumber(row.spend),
        impressions: total.impressions + toNumber(row.impressions),
        clicks: total.clicks + toNumber(row.clicks),
        linkClicks: total.linkClicks + toNumber(row.link_clicks),
        landingPageViews: total.landingPageViews + toNumber(row.landing_page_views),
        metaLeads: total.metaLeads + toNumber(row.website_leads),
      }),
      { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, landingPageViews: 0, metaLeads: 0 },
    );
    const funnel = funnelRows[0];
    const crmLeads = toNumber(funnel?.crm_leads);
    const invoiceJobs = toNumber(funnel?.invoice_jobs);
    const coveredInvoiceJobs = toNumber(funnel?.material_covered_invoice_jobs);
    const revenue = toNumber(funnel?.invoiced_revenue);
    const profitCoverageComplete = invoiceJobs > 0 && invoiceJobs === coveredInvoiceJobs;

    return NextResponse.json({
      period: { key: period, label: range.label, start: startDate, end: endDate },
      meta: {
        accountId: META_ACCOUNT_ID,
        spend: round(totals.spend), impressions: totals.impressions, clicks: totals.clicks,
        linkClicks: totals.linkClicks, landingPageViews: totals.landingPageViews,
        websiteLeads: totals.metaLeads,
        costPerLead: totals.metaLeads ? round(totals.spend / totals.metaLeads) : null,
        ctr: totals.impressions ? round((totals.clicks / totals.impressions) * 100, 2) : null,
        campaigns: campaignRows.map((row) => {
          const leads = toNumber(row.website_leads);
          const spend = toNumber(row.spend);
          return {
            id: row.campaign_id, name: row.campaign_name || "Unnamed campaign", spend: round(spend),
            websiteLeads: leads, costPerLead: leads ? round(spend / leads) : null,
            impressions: toNumber(row.impressions), linkClicks: toNumber(row.link_clicks),
          };
        }),
      },
      funnel: {
        crmLeads,
        appointmentsSet: toNumber(funnel?.appointments_set),
        appointmentsRan: toNumber(funnel?.appointments_ran),
        estimatesSent: toNumber(funnel?.estimates_sent),
        approvedEstimates: toNumber(funnel?.approved_estimates),
        confirmedSigned: toNumber(funnel?.confirmed_signed),
        invoiceJobs,
        invoicedRevenue: round(revenue),
        materialCoveredInvoiceJobs: coveredInvoiceJobs,
        materialCost: round(toNumber(funnel?.material_cost)),
        profitCoverageComplete,
        materialOnlyGrossProfit: profitCoverageComplete ? round(revenue - toNumber(funnel?.material_cost)) : null,
      },
      attribution: {
        sourceName: ROOF_IGNITE_SOURCE,
        unmatchedMetaLeads: Math.max(0, totals.metaLeads - crmLeads),
        crmMatchRate: totals.metaLeads ? round((crmLeads / totals.metaLeads) * 100, 1) : null,
        revenueRoas: revenue > 0 && totals.spend > 0 ? round(revenue / totals.spend, 2) : null,
        costPerMaterialOnlyProfit: profitCoverageComplete && revenue > toNumber(funnel?.material_cost)
          ? round(totals.spend / (revenue - toNumber(funnel?.material_cost))) : null,
      },
      sync: syncRows[0] || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const setupRequired = /meta_ads_daily_insights|meta_ads_sync_runs/i.test(message);
    return NextResponse.json(
      { error: setupRequired ? "The Meta analytics ledger has not been deployed yet." : "Unable to load Meta analytics.", setupRequired },
      { status: setupRequired ? 503 : 500 },
    );
  }
}
