import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, isValidPeriodKey, toUnixSeconds } from "@/lib/dates";
import { STAGES } from "@/lib/constants";


const SOLD_STATUSES = [
  "Sold Job",
  "Production Ready",
  "Job Scheduled",
  "In Production",
  "All Work Complete",
  "All Work Completed",
  "Final Invoicing",
  "Invoiced",
  "Job Close Out",
  "Paid & Closed",
];

const CLOSED_STATUSES = ["Paid & Closed", "Job Close Out", "All Work Complete", "All Work Completed"];
const INVOICE_STATUSES = ["Sent", "Open", "Closed"];
const WEEKLY_RETAIL_GOAL = 51_230;

const RETAIL_WHERE = `
  j.record_type_name = 'Retail'
  AND j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(rowValue: string | number | null | undefined): number {
  return round2(Number(rowValue ?? 0));
}

interface StageRow {
  stage: string | null;
  jobs: string;
  value: string;
  oldest_status_change: string | null;
}

interface ActionRow {
  job_jnid: string;
  job_number: string | null;
  job_name: string;
  sales_rep_name: string | null;
  status_name: string | null;
  source_name: string | null;
  value: string | null;
  due_amount: string | null;
  invoice_number: string | null;
  age_days: string | null;
  reason: string;
  priority: string;
}

interface RepRow {
  sales_rep_name: string | null;
  new_leads: string;
  sold_jobs: string;
  lost_jobs: string;
  open_jobs: string;
  open_pipeline: string;
  sold_value: string;
  invoiced_revenue: string;
  avg_followup_days: string | null;
}

interface MarginRow {
  job_jnid: string;
  job_name: string;
  sales_rep_name: string | null;
  status_name: string | null;
  revenue: string | null;
  material_cost: string | null;
  subcontractor_cost: string | null;
  crew_labor_cost: string | null;
  total_cost: string | null;
  gross_profit: string | null;
  gross_profit_margin_pct: string | null;
  cost_status: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = isValidPeriodKey(periodParam) ? periodParam : "month";
    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);
    const nowUnix = toUnixSeconds(new Date());
    const next14Unix = nowUnix + 14 * 24 * 60 * 60;
    const weekRange = getDateRange("week");
    const weekStartUnix = toUnixSeconds(weekRange.start);
    const weekEndUnix = toUnixSeconds(weekRange.end);

    const [
      revenueRows,
      weeklyRows,
      soldRows,
      pipelineRows,
      scheduledRows,
      stageRows,
      repRows,
      actionRows,
      marginRows,
      dataRows,
      sourceRows,
    ] = await Promise.all([
      query<{ revenue: string; collected: string; invoices: string }>(
        `SELECT
           COALESCE(SUM(i.total), 0)::text AS revenue,
           COALESCE(SUM(i.total_paid), 0)::text AS collected,
           COUNT(*)::text AS invoices
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE ${RETAIL_WHERE}
           AND i.is_active = true
           AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
           AND i.date_invoice >= $1
           AND i.date_invoice < $2`,
        [startUnix, endUnix, INVOICE_STATUSES]
      ),
      query<{ revenue: string }>(
        `SELECT COALESCE(SUM(i.total), 0)::text AS revenue
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE ${RETAIL_WHERE}
           AND i.is_active = true
           AND COALESCE(i.status_name, i.status::text, '') = ANY($3::text[])
           AND i.date_invoice >= $1
           AND i.date_invoice < $2`,
        [weekStartUnix, weekEndUnix, INVOICE_STATUSES]
      ),
      query<{ sold_jobs: string; sold_value: string }>(
        `SELECT
           COUNT(*)::text AS sold_jobs,
           COALESCE(SUM(COALESCE(NULLIF(j.approved_invoice_total, 0), NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_invoice, 0), NULLIF(j.last_estimate, 0), 0)), 0)::text AS sold_value
         FROM jobs j
         WHERE ${RETAIL_WHERE}
           AND j.status_name = ANY($3::text[])
           AND j.jn_date_status_change >= $1
           AND j.jn_date_status_change < $2`,
        [startUnix, endUnix, SOLD_STATUSES]
      ),
      query<{ jobs: string; value: string; open_estimate_value: string }>(
        `SELECT
           COUNT(*)::text AS jobs,
           COALESCE(SUM(COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0)), 0)::text AS value,
           COALESCE(SUM(CASE WHEN j.status_name IN ('Estimate Sent', 'Estimating') THEN COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), 0) ELSE 0 END), 0)::text AS open_estimate_value
         FROM jobs j
         WHERE ${RETAIL_WHERE}
           AND j.is_closed = false
           AND COALESCE(j.status_name, '') <> ALL($1::text[])`,
        [CLOSED_STATUSES]
      ),
      query<{ jobs: string; value: string }>(
        `SELECT
           COUNT(*)::text AS jobs,
           COALESCE(SUM(COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0)), 0)::text AS value
         FROM jobs j
         WHERE ${RETAIL_WHERE}
           AND j.date_start IS NOT NULL
           AND j.date_start >= $1
           AND j.date_start < $2
           AND COALESCE(j.status_name, '') <> ALL($3::text[])`,
        [nowUnix, next14Unix, CLOSED_STATUSES]
      ),
      query<StageRow>(
        `SELECT
           COALESCE(CASE
             WHEN j.status_name IN ('Lead', 'New', 'Cold Lead', 'Cold') THEN 'Lead'
             WHEN j.status_name = 'Appointment Scheduled' THEN 'Appointment Scheduled'
             WHEN j.status_name IN ('Estimating', 'Estimate Sent') THEN 'Estimating'
             WHEN j.status_name = 'Sold Job' THEN 'Sold'
             WHEN j.status_name IN ('Production Ready', 'In Progress', 'Job Scheduled', 'Insurance Pending', 'Future Work', 'Needs Rescheduling') THEN 'Production'
             WHEN j.status_name IN ('Invoiced', 'Final Invoicing', 'Pending Final Payment', 'Job Close Out') THEN 'Invoicing'
             WHEN j.status_name IN ('Paid & Closed', 'All Work Completed', 'All Work Complete', 'Job Completed', 'Warranty Complete') THEN 'Completed'
             ELSE j.status_name
           END, 'Unknown') AS stage,
           COUNT(*)::text AS jobs,
           COALESCE(SUM(COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0)), 0)::text AS value,
           MIN(j.jn_date_status_change)::text AS oldest_status_change
         FROM jobs j
         WHERE ${RETAIL_WHERE}
           AND j.is_closed = false
         GROUP BY stage`,
        []
      ),
      query<RepRow>(
        `SELECT
           COALESCE(j.sales_rep_name, 'Unassigned') AS sales_rep_name,
           COUNT(*) FILTER (WHERE j.jn_date_created >= $1 AND j.jn_date_created < $2)::text AS new_leads,
           COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2)::text AS sold_jobs,
           COUNT(*) FILTER (WHERE j.status_name = ANY($4::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2)::text AS lost_jobs,
           COUNT(*) FILTER (WHERE j.is_closed = false)::text AS open_jobs,
           COALESCE(SUM(CASE WHEN j.is_closed = false THEN COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0) ELSE 0 END), 0)::text AS open_pipeline,
           COALESCE(SUM(CASE WHEN j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2 THEN COALESCE(NULLIF(j.approved_invoice_total, 0), NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_invoice, 0), NULLIF(j.last_estimate, 0), 0) ELSE 0 END), 0)::text AS sold_value,
           COALESCE(SUM(CASE WHEN i.date_invoice >= $1 AND i.date_invoice < $2 AND i.is_active = true THEN i.total ELSE 0 END), 0)::text AS invoiced_revenue,
           AVG(CASE WHEN j.status_name IN ('Estimate Sent', 'Estimating') THEN GREATEST(0, ($5 - COALESCE(j.jn_date_status_change, j.jn_date_created)) / 86400.0) END)::text AS avg_followup_days
         FROM jobs j
         LEFT JOIN invoices i ON i.job_jnid = j.jnid
         WHERE ${RETAIL_WHERE}
         GROUP BY COALESCE(j.sales_rep_name, 'Unassigned')
         HAVING COUNT(*) FILTER (WHERE j.jn_date_created >= $1 AND j.jn_date_created < $2) > 0
             OR COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2) > 0
             OR COUNT(*) FILTER (WHERE j.is_closed = false) > 0
         ORDER BY
           SUM(CASE WHEN j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2 THEN COALESCE(NULLIF(j.approved_invoice_total, 0), NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_invoice, 0), NULLIF(j.last_estimate, 0), 0) ELSE 0 END) DESC,
           SUM(CASE WHEN j.is_closed = false THEN COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0) ELSE 0 END) DESC`,
        [startUnix, endUnix, SOLD_STATUSES, ["Lost", "Dead", "Cold", "Cold Lead"], nowUnix]
      ),
      query<ActionRow>(
        `WITH candidates AS (
           SELECT
             j.jnid AS job_jnid,
             j.number::text AS job_number,
             j.name AS job_name,
             j.sales_rep_name,
             j.status_name,
             j.source_name,
             COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0) AS value,
             0::numeric AS due_amount,
             NULL::text AS invoice_number,
             GREATEST(0, (($1 - COALESCE(j.jn_date_status_change, j.jn_date_created)) / 86400.0)) AS age_days,
             CASE
               WHEN j.status_name = 'Estimating' AND (($1 - COALESCE(j.jn_date_status_change, j.jn_date_created)) / 86400.0) >= 2 THEN 'Estimate needs to go out'
               WHEN j.status_name = 'Estimate Sent' AND (($1 - COALESCE(j.jn_date_status_change, j.jn_date_created)) / 86400.0) >= 2 THEN 'Follow up on open estimate'
               WHEN j.status_name = 'Sold Job' AND (($1 - COALESCE(j.jn_date_status_change, j.jn_date_created)) / 86400.0) >= 2 THEN 'Sold retail job needs scheduling'
               WHEN j.status_name IN ('All Work Complete', 'All Work Completed') THEN 'Completed retail job needs final invoice/closeout'
               WHEN (j.sales_rep_name IS NULL OR j.source_name IS NULL OR COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), 0) = 0) THEN 'Data cleanup needed'
               ELSE NULL
             END AS reason,
             CASE
               WHEN j.status_name = 'Estimate Sent' AND (($1 - COALESCE(j.jn_date_status_change, j.jn_date_created)) / 86400.0) >= 7 THEN 'high'
               WHEN j.status_name = 'Estimating' AND (($1 - COALESCE(j.jn_date_status_change, j.jn_date_created)) / 86400.0) >= 4 THEN 'high'
               WHEN j.status_name IN ('All Work Complete', 'All Work Completed') THEN 'high'
               ELSE 'medium'
             END AS priority
           FROM jobs j
           WHERE ${RETAIL_WHERE}
             AND j.is_closed = false
         ), unpaid AS (
           SELECT
             j.jnid AS job_jnid,
             j.number::text AS job_number,
             j.name AS job_name,
             j.sales_rep_name,
             j.status_name,
             j.source_name,
             COALESCE(NULLIF(j.approved_invoice_total, 0), NULLIF(j.approved_estimate_total, 0), 0) AS value,
             COALESCE(i.due, i.total - COALESCE(i.total_paid, 0), 0) AS due_amount,
             i.number::text AS invoice_number,
             GREATEST(0, (($1 - COALESCE(i.date_invoice, i.jn_date_created, j.jn_date_status_change, j.jn_date_created)) / 86400.0)) AS age_days,
             'Invoice is open/unpaid'::text AS reason,
             CASE WHEN GREATEST(0, (($1 - COALESCE(i.date_invoice, i.jn_date_created, j.jn_date_status_change, j.jn_date_created)) / 86400.0)) >= 7 THEN 'high' ELSE 'medium' END AS priority
           FROM invoices i
           JOIN jobs j ON j.jnid = i.job_jnid
           WHERE ${RETAIL_WHERE}
             AND i.is_active = true
             AND COALESCE(i.due, i.total - COALESCE(i.total_paid, 0), 0) > 0
         )
         SELECT * FROM (
           SELECT * FROM candidates WHERE reason IS NOT NULL
           UNION ALL
           SELECT * FROM unpaid
         ) x
         ORDER BY CASE priority WHEN 'high' THEN 1 ELSE 2 END, value DESC NULLS LAST, age_days DESC NULLS LAST
         LIMIT 12`,
        [nowUnix]
      ),
      query<MarginRow>(
        `SELECT
           c.job_jnid,
           c.job_name,
           c.sales_rep_name,
           c.status_name,
           c.invoiced_total AS revenue,
           c.material_cost,
           c.subcontractor_cost,
           c.crew_labor_cost,
           c.total_cost,
           c.gross_profit,
           c.gross_profit_margin_pct,
           c.cost_status
         FROM v_job_total_costs c
         JOIN jobs j ON j.jnid = c.job_jnid
         WHERE ${RETAIL_WHERE}
           AND j.status_name = ANY($3::text[])
           AND j.jn_date_status_change >= $1
           AND j.jn_date_status_change < $2
         ORDER BY c.gross_profit_margin_pct ASC NULLS FIRST
         LIMIT 25`,
        [startUnix, endUnix, CLOSED_STATUSES]
      ),
      query<{
        missing_source: string;
        missing_rep: string;
        missing_value: string;
        missing_cost: string;
        possible_misclassified: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE j.source_name IS NULL OR j.source_name = '')::text AS missing_source,
           COUNT(*) FILTER (WHERE j.sales_rep_name IS NULL OR j.sales_rep_name = '')::text AS missing_rep,
           COUNT(*) FILTER (WHERE COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0) = 0)::text AS missing_value,
           COUNT(*) FILTER (WHERE j.status_name = ANY($1::text[]) AND COALESCE(c.total_cost, 0) = 0)::text AS missing_cost,
           COUNT(*) FILTER (WHERE COALESCE(j.name, '') ~* '(insurance|claim|adjuster|supplement)')::text AS possible_misclassified
         FROM jobs j
         LEFT JOIN v_job_total_costs c ON c.job_jnid = j.jnid
         WHERE ${RETAIL_WHERE}
           AND j.is_closed = false`,
        [SOLD_STATUSES]
      ),
      query<{ source_name: string | null; jobs: string; sold_jobs: string; sold_value: string; open_pipeline: string }>(
        `SELECT
           COALESCE(j.source_name, 'Unknown') AS source_name,
           COUNT(*) FILTER (WHERE j.jn_date_created >= $1 AND j.jn_date_created < $2)::text AS jobs,
           COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2)::text AS sold_jobs,
           COALESCE(SUM(CASE WHEN j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2 THEN COALESCE(NULLIF(j.approved_invoice_total, 0), NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_invoice, 0), NULLIF(j.last_estimate, 0), 0) ELSE 0 END), 0)::text AS sold_value,
           COALESCE(SUM(CASE WHEN j.is_closed = false THEN COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0) ELSE 0 END), 0)::text AS open_pipeline
         FROM jobs j
         WHERE ${RETAIL_WHERE}
         GROUP BY COALESCE(j.source_name, 'Unknown')
         HAVING COUNT(*) FILTER (WHERE j.jn_date_created >= $1 AND j.jn_date_created < $2) > 0
             OR COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2) > 0
             OR SUM(CASE WHEN j.is_closed = false THEN COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0) ELSE 0 END) > 0
         ORDER BY
           SUM(CASE WHEN j.status_name = ANY($3::text[]) AND j.jn_date_status_change >= $1 AND j.jn_date_status_change < $2 THEN COALESCE(NULLIF(j.approved_invoice_total, 0), NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_invoice, 0), NULLIF(j.last_estimate, 0), 0) ELSE 0 END) DESC,
           SUM(CASE WHEN j.is_closed = false THEN COALESCE(NULLIF(j.approved_estimate_total, 0), NULLIF(j.last_estimate, 0), NULLIF(j.approved_invoice_total, 0), 0) ELSE 0 END) DESC
         LIMIT 10`,
        [startUnix, endUnix, SOLD_STATUSES]
      ),
    ]);

    const stageByName = new Map(stageRows.map((row) => [row.stage ?? "Unknown", row]));
    const stages = STAGES.map((stage) => {
      const row = stageByName.get(stage);
      const oldest = row?.oldest_status_change ? Number(row.oldest_status_change) : null;
      return {
        stage,
        jobs: Number(row?.jobs ?? 0),
        value: money(row?.value),
        oldestDays: oldest ? round1((nowUnix - oldest) / 86400) : null,
      };
    });

    const revenue = money(revenueRows[0]?.revenue);
    const weeklyRevenue = money(weeklyRows[0]?.revenue);
    const soldJobs = Number(soldRows[0]?.sold_jobs ?? 0);
    const soldValue = money(soldRows[0]?.sold_value);
    const avgTicket = soldJobs > 0 ? round2(soldValue / soldJobs) : revenueRows[0]?.invoices ? round2(revenue / Math.max(1, Number(revenueRows[0].invoices))) : 0;
    const jobsNeededThisWeek = avgTicket > 0 ? round1(Math.max(0, WEEKLY_RETAIL_GOAL - weeklyRevenue) / avgTicket) : null;

    const marginRevenue = marginRows.reduce((sum, row) => sum + money(row.revenue), 0);
    const marginGp = marginRows.reduce((sum, row) => sum + money(row.gross_profit), 0);
    const marginPct = marginRevenue > 0 ? round1((marginGp / marginRevenue) * 100) : null;

    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      target: {
        weeklyRevenueGoal: WEEKLY_RETAIL_GOAL,
        thisWeekRevenue: weeklyRevenue,
        gapThisWeek: round2(Math.max(0, WEEKLY_RETAIL_GOAL - weeklyRevenue)),
        jobsNeededThisWeek,
      },
      summary: {
        invoicedRevenue: revenue,
        collectedRevenue: money(revenueRows[0]?.collected),
        invoiceCount: Number(revenueRows[0]?.invoices ?? 0),
        soldJobs,
        soldValue,
        avgTicket,
        openPipelineValue: money(pipelineRows[0]?.value),
        openRetailJobs: Number(pipelineRows[0]?.jobs ?? 0),
        openEstimateValue: money(pipelineRows[0]?.open_estimate_value),
        scheduled14Value: money(scheduledRows[0]?.value),
        scheduled14Jobs: Number(scheduledRows[0]?.jobs ?? 0),
        closedGrossProfit: round2(marginGp),
        closedMarginPct: marginPct,
      },
      stages,
      reps: repRows.map((row) => ({
        repName: row.sales_rep_name ?? "Unassigned",
        newLeads: Number(row.new_leads),
        soldJobs: Number(row.sold_jobs),
        lostJobs: Number(row.lost_jobs),
        openJobs: Number(row.open_jobs),
        openPipeline: money(row.open_pipeline),
        soldValue: money(row.sold_value),
        invoicedRevenue: money(row.invoiced_revenue),
        estimateCloseRate: Number(row.sold_jobs) + Number(row.lost_jobs) > 0 ? round1((Number(row.sold_jobs) / (Number(row.sold_jobs) + Number(row.lost_jobs))) * 100) : null,
        avgFollowupDays: row.avg_followup_days ? round1(Number(row.avg_followup_days)) : null,
      })),
      actions: actionRows.map((row) => ({
        jobJnid: row.job_jnid,
        jobNumber: row.job_number,
        jobName: row.job_name,
        repName: row.sales_rep_name ?? "Unassigned",
        status: row.status_name ?? "Unknown",
        source: row.source_name ?? "Unknown",
        value: money(row.value),
        dueAmount: money(row.due_amount),
        invoiceNumber: row.invoice_number,
        ageDays: row.age_days ? round1(Number(row.age_days)) : null,
        reason: row.reason,
        priority: row.priority,
        jobUrl: `https://app.jobnimbus.com/jobs/${row.job_jnid}`,
      })),
      margins: marginRows.map((row) => ({
        jobJnid: row.job_jnid,
        jobName: row.job_name,
        repName: row.sales_rep_name ?? "Unassigned",
        status: row.status_name ?? "Unknown",
        revenue: money(row.revenue),
        materialCost: money(row.material_cost),
        subcontractorCost: money(row.subcontractor_cost),
        laborCost: money(row.crew_labor_cost),
        totalCost: money(row.total_cost),
        grossProfit: money(row.gross_profit),
        marginPct: row.gross_profit_margin_pct ? round1(Number(row.gross_profit_margin_pct)) : null,
        costStatus: row.cost_status ?? "unknown",
        jobUrl: `https://app.jobnimbus.com/jobs/${row.job_jnid}`,
      })),
      sources: sourceRows.map((row) => ({
        sourceName: row.source_name ?? "Unknown",
        jobs: Number(row.jobs),
        soldJobs: Number(row.sold_jobs),
        soldValue: money(row.sold_value),
        openPipeline: money(row.open_pipeline),
      })),
      dataHealth: {
        missingSource: Number(dataRows[0]?.missing_source ?? 0),
        missingRep: Number(dataRows[0]?.missing_rep ?? 0),
        missingValue: Number(dataRows[0]?.missing_value ?? 0),
        missingCost: Number(dataRows[0]?.missing_cost ?? 0),
        possibleMisclassified: Number(dataRows[0]?.possible_misclassified ?? 0),
        notes: [
          "Retail is now explicit record_type_name = Retail, not the old catch-all bucket.",
          "Test/demo jobs are excluded by name/contact heuristics.",
          "Revenue uses active invoices in Sent/Open/Closed/Paid statuses by invoice date.",
          "Sold value uses status-change date and invoice total with estimate fallback.",
          "Gross profit comes from v_job_total_costs and should be treated as cost-coverage dependent.",
        ],
      },
    });
  } catch (error) {
    console.error("[Retail Growth API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch retail growth metrics" },
      { status: 500 }
    );
  }
}
