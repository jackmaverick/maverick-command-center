import { NextRequest, NextResponse } from "next/server";
import { qboQuery, qboReport, getQBOConnection } from "@/lib/quickbooks";
import { query } from "@/lib/db";
import { SEGMENT_SQL } from "@/lib/segment";
import { toUnixSeconds } from "@/lib/dates";
import {
  addWeeks,
  startOfWeek,
  endOfWeek,
  subMonths,
  format,
} from "date-fns";
import type {
  CashFlowMetrics,
  CashFlowWeek,
  CashFlowScenario,
  ExpectedCollection,
  EstimateSentForecastGroup,
  EstimateSentForecastJob,
} from "@/types";

type Horizon = "30" | "60" | "90";
const JOBNIMBUS_BASE_URL = "https://app.jobnimbus.com/job/";

type EstimateSentCurrentRow = {
  job_jnid: string;
  job_name: string;
  record_type: string | null;
  trade: string;
  estimate_value: string;
  sent_at: string | null;
};

type EstimateSentHistoryRow = {
  record_type: string | null;
  trade: string;
  historical_sent: string;
  historical_sold: string;
  avg_days_to_close: string | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cohortKey(recordType: string, trade: string): string {
  return `${recordType.toLowerCase()}::${trade.toLowerCase()}`;
}

function confidenceForSample(historicalSent: number): "high" | "medium" | "low" {
  if (historicalSent >= 30) return "high";
  if (historicalSent >= 10) return "medium";
  return "low";
}

function estimateProbability(closeRate: number, daysSinceSent: number, avgDaysToClose: number | null): number {
  if (!avgDaysToClose || avgDaysToClose <= 0) return closeRate;
  if (daysSinceSent <= avgDaysToClose) return closeRate;

  // Once an estimate has lived longer than the historical average close window,
  // it does not become zero. It decays by age because stale estimates still close,
  // just not at the same odds as a fresh one.
  const overAverageBy = daysSinceSent - avgDaysToClose;
  const halfLives = overAverageBy / Math.max(avgDaysToClose, 7);
  return clamp(closeRate * Math.pow(0.5, halfLives), 0.05, closeRate);
}

// Collection probability by days outstanding
function getCollectionProbability(
  daysOutstanding: number,
  segment: string | null
): number {
  // Insurance claims have longer cycles
  const isInsurance = segment === "insurance";
  if (daysOutstanding <= 30) return isInsurance ? 0.85 : 0.9;
  if (daysOutstanding <= 60) return isInsurance ? 0.6 : 0.7;
  if (daysOutstanding <= 90) return isInsurance ? 0.35 : 0.4;
  return isInsurance ? 0.1 : 0.15;
}

export async function GET(request: NextRequest) {
  try {
    const conn = await getQBOConnection();
    if (!conn) {
      return NextResponse.json(
        { error: "QuickBooks not connected" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const horizonParam = searchParams.get("horizon") ?? "90";
    const horizon: Horizon = ["30", "60", "90"].includes(horizonParam)
      ? (horizonParam as Horizon)
      : "90";
    const weeks = parseInt(horizon) / 7;

    const now = new Date();

    // ── Fetch data from multiple sources in parallel ──────────────────────

    const [
      // QBO bank balances
      bankAccounts,
      // QBO trailing expenses (burn rate)
      expenseReport,
      // Outstanding JN invoices (projected inflows)
      outstandingInvoices,
      // Pipeline (weighted by stage)
      pipelineJobs,
      // QBO outstanding invoices
      qboOutstanding,
      // Material costs (projected outflows)
      recentMaterialCosts,
      // Open Estimate Sent jobs for probability-weighted revenue forecast
      estimateSentCurrentRows,
      // Historical Estimate Sent conversion cohorts by record type + inferred trade
      estimateSentHistoryRows,
    ] = await Promise.all([
      // 1. Bank account balances from QBO
      qboQuery<{
        Id: string;
        Name: string;
        CurrentBalance: number;
        AccountType: string;
      }>(
        "SELECT Id, Name, CurrentBalance, AccountType FROM Account WHERE AccountType = 'Bank' AND Active = true"
      ),

      // 2. Trailing 3-month expenses for burn rate
      qboReport("ProfitAndLoss", {
        start_date: format(subMonths(now, 3), "yyyy-MM-dd"),
        end_date: format(now, "yyyy-MM-dd"),
        summarize_column_by: "Month",
      }),

      // 3. Outstanding JN invoices (not fully paid)
      query<{
        jnid: string;
        number: string | null;
        total: string;
        total_paid: string;
        due: string;
        date_due: string | null;
        date_invoice: string;
        job_jnid: string | null;
        segment: string | null;
        customer_name: string | null;
      }>(
        `SELECT
           i.jnid,
           i.number,
           i.total::text,
           COALESCE(i.total_paid, 0)::text AS total_paid,
           COALESCE(i.due, i.total - COALESCE(i.total_paid, 0))::text AS due,
           i.date_due::text,
           i.date_invoice::text,
           i.job_jnid,
           (${SEGMENT_SQL}) AS segment,
           COALESCE(c.display_name, 'Unknown') AS customer_name
         FROM invoices i
         LEFT JOIN jobs j ON j.jnid = i.job_jnid
         LEFT JOIN contacts c ON c.jnid = i.contact_jnid
         WHERE i.is_active = true
           AND COALESCE(i.due, i.total - COALESCE(i.total_paid, 0)) > 0
         ORDER BY i.date_due ASC NULLS LAST`
      ),

      // 4. Pipeline jobs with estimate totals (weighted inflow)
      query<{
        jnid: string;
        status_name: string;
        approved_estimate_total: string;
        segment: string | null;
      }>(
        `SELECT
           j.jnid,
           j.status_name,
           j.approved_estimate_total::text,
           (${SEGMENT_SQL}) AS segment
         FROM jobs j
         WHERE j.is_active = true
           AND j.is_closed = false
           AND j.is_archived = false
           AND j.status_name IN ('Estimating', 'Estimate Sent', 'Sold Job', 'Production Ready', 'In Progress')
           AND j.approved_estimate_total > 0`
      ),

      // 5. QBO outstanding invoices
      qboQuery<{
        Id: string;
        DocNumber: string;
        CustomerRef: { name: string };
        TotalAmt: number;
        Balance: number;
        DueDate: string;
        TxnDate: string;
      }>("SELECT * FROM Invoice WHERE Balance > '0'"),

      // 6. Recent material costs (trailing 3 months avg for projected outflows)
      query<{ avg_monthly: string }>(
        `SELECT COALESCE(AVG(monthly_cost), 0)::text AS avg_monthly
         FROM (
           SELECT
             EXTRACT(MONTH FROM to_timestamp(i.date_invoice)) AS m,
             SUM(i.total) AS monthly_cost
           FROM invoices i
           WHERE i.is_active = true
             AND i.date_invoice >= $1
           GROUP BY m
         ) sub`,
        [toUnixSeconds(subMonths(now, 3))]
      ),

      query<EstimateSentCurrentRow>(
        `WITH latest_estimate AS (
           SELECT DISTINCT ON (e.job_jnid)
             e.job_jnid,
             e.total,
             e.date_estimate
           FROM estimates e
           WHERE e.is_active = true
             AND e.is_archived = false
             AND COALESCE(e.status_name, '') IN ('Sent', 'Approved')
           ORDER BY e.job_jnid, e.date_estimate DESC NULLS LAST, e.jn_date_updated DESC NULLS LAST
         ), estimate_sent_at AS (
           SELECT
             h.job_jnid,
             MIN(h.changed_at) FILTER (WHERE h.to_stage_name = 'Estimate Sent') AS sent_at
           FROM job_stage_history h
           GROUP BY h.job_jnid
         )
         SELECT
           j.jnid AS job_jnid,
           COALESCE(j.name, j.number, 'Unknown job') AS job_name,
           COALESCE(j.record_type_name, 'Other') AS record_type,
           CASE
             WHEN COALESCE(j.name, '') ~* 'gutter' THEN 'Gutters'
             WHEN COALESCE(j.name, '') ~* 'siding' THEN 'Siding'
             WHEN COALESCE(j.name, '') ~* 'window' THEN 'Windows'
             WHEN COALESCE(j.record_type_name, '') ~* 'repair' OR COALESCE(j.name, '') ~* 'repair' THEN 'Repairs'
             ELSE 'Roofing'
           END AS trade,
           GREATEST(
             COALESCE(j.approved_estimate_total, 0),
             COALESCE(j.last_estimate, 0),
             COALESCE(le.total, 0),
             0
           )::text AS estimate_value,
           COALESCE(esa.sent_at, le.date_estimate, to_timestamp(NULLIF(j.jn_date_status_change, 0)))::text AS sent_at
         FROM jobs j
         LEFT JOIN latest_estimate le ON le.job_jnid = j.jnid
         LEFT JOIN estimate_sent_at esa ON esa.job_jnid = j.jnid
         WHERE j.is_active = true
           AND j.is_archived = false
           AND COALESCE(j.deleted_at::text, '') = ''
           AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
           AND j.status_name = 'Estimate Sent'
           AND GREATEST(
             COALESCE(j.approved_estimate_total, 0),
             COALESCE(j.last_estimate, 0),
             COALESCE(le.total, 0),
             0
           ) > 0
         ORDER BY GREATEST(
             COALESCE(j.approved_estimate_total, 0),
             COALESCE(j.last_estimate, 0),
             COALESCE(le.total, 0),
             0
           ) DESC`
      ),

      query<EstimateSentHistoryRow>(
        `WITH job_gates AS (
           SELECT
             j.jnid,
             COALESCE(j.record_type_name, 'Other') AS record_type,
             CASE
               WHEN COALESCE(j.name, '') ~* 'gutter' THEN 'Gutters'
               WHEN COALESCE(j.name, '') ~* 'siding' THEN 'Siding'
               WHEN COALESCE(j.name, '') ~* 'window' THEN 'Windows'
               WHEN COALESCE(j.record_type_name, '') ~* 'repair' OR COALESCE(j.name, '') ~* 'repair' THEN 'Repairs'
               ELSE 'Roofing'
             END AS trade,
             MIN(h.changed_at) FILTER (WHERE h.to_stage_name = 'Estimate Sent') AS estimate_sent_at,
             MIN(h.changed_at) FILTER (
               WHERE h.to_stage_name IN (
                 'Sold Job', 'Signed Contract', 'Contingency Signed', 'Fully Approved',
                 'Production Ready', 'Job Scheduled', 'In Production', 'In Progress', 'Paid & Closed'
               )
             ) AS sold_at
           FROM jobs j
           LEFT JOIN job_stage_history h ON h.job_jnid = j.jnid
           WHERE j.is_active = true
             AND j.is_archived = false
             AND COALESCE(j.deleted_at::text, '') = ''
             AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|jane tester)'
           GROUP BY j.jnid, j.record_type_name, j.name
         )
         SELECT
           record_type,
           trade,
           COUNT(*) FILTER (WHERE estimate_sent_at IS NOT NULL)::text AS historical_sent,
           COUNT(*) FILTER (WHERE estimate_sent_at IS NOT NULL AND sold_at IS NOT NULL AND sold_at > estimate_sent_at)::text AS historical_sold,
           AVG(EXTRACT(DAY FROM sold_at - estimate_sent_at)) FILTER (
             WHERE estimate_sent_at IS NOT NULL AND sold_at IS NOT NULL AND sold_at > estimate_sent_at
           )::text AS avg_days_to_close
         FROM job_gates
         WHERE estimate_sent_at IS NOT NULL
         GROUP BY record_type, trade
         HAVING COUNT(*) FILTER (WHERE estimate_sent_at IS NOT NULL) > 0
         ORDER BY historical_sent DESC`
      ),
    ]);

    // ── Process results ───────────────────────────────────────────────────

    // 1. Current cash
    console.log("[Cash Flow] Bank accounts found:", bankAccounts.length);
    for (const a of bankAccounts) {
      console.log(`[Cash Flow]   ${a.Name}: $${a.CurrentBalance} (${a.AccountType})`);
    }
    const currentCash = bankAccounts.reduce(
      (sum, a) => sum + (a.CurrentBalance ?? 0),
      0
    );
    console.log("[Cash Flow] Total cash:", currentCash);

    // 2. Burn rate (avg monthly expenses from trailing 3 months)
    let totalExpenses = 0;
    // Track which month indices have non-zero expenses (across all sections)
    const activeMonths = new Set<number>();
    if (expenseReport.Rows?.Row) {
      for (const section of expenseReport.Rows.Row) {
        if (
          (section.group === "Expenses" || section.group === "OtherExpenses" || section.group === "CostOfGoodsSold") &&
          section.Summary?.ColData
        ) {
          // Sum up monthly expense columns (skip label at index 0)
          for (let i = 1; i < section.Summary.ColData.length; i++) {
            const val =
              parseFloat(section.Summary.ColData[i]?.value ?? "0") || 0;
            if (val !== 0) {
              totalExpenses += Math.abs(val);
              activeMonths.add(i);
            }
          }
        }
      }
    }
    console.log("[Cash Flow] Total expenses:", totalExpenses, "across", activeMonths.size, "months");
    const burnRate = activeMonths.size > 0 ? totalExpenses / activeMonths.size : 0;
    const weeklyBurn = burnRate / 4.33;

    // 3. Expected collections from outstanding invoices
    const expectedCollections: ExpectedCollection[] = outstandingInvoices.map(
      (inv) => {
        const outstanding = parseFloat(inv.due);
        const invoiceDate = parseInt(inv.date_invoice) * 1000;
        const daysOut = Math.floor(
          (Date.now() - invoiceDate) / (1000 * 60 * 60 * 24)
        );
        const probability = getCollectionProbability(daysOut, inv.segment);

        return {
          source: "invoice",
          jobName: inv.number ? `Invoice #${inv.number}` : inv.jnid,
          amount: outstanding,
          dueDate: inv.date_due
            ? new Date(parseInt(inv.date_due) * 1000).toISOString()
            : null,
          daysOutstanding: daysOut,
          probability,
          weightedAmount: Math.round(outstanding * probability * 100) / 100,
          segment: inv.segment,
        };
      }
    );

    // Pipeline weighted inflows (stage-based probability)
    const stageWeights: Record<string, number> = {
      Estimating: 0.15,
      "Estimate Sent": 0.25,
      "Sold Job": 0.7,
      "Production Ready": 0.85,
      "In Progress": 0.9,
    };

    const soldPipelineWeighted = pipelineJobs.reduce((sum, job) => {
      if (job.status_name === "Estimate Sent" || job.status_name === "Estimating") return sum;
      const weight = stageWeights[job.status_name] ?? 0.1;
      return sum + parseFloat(job.approved_estimate_total) * weight;
    }, 0);

    const historyByGroup = new Map<string, {
      historicalSent: number;
      historicalSold: number;
      closeRate: number;
      avgDaysToClose: number | null;
      confidence: "high" | "medium" | "low";
    }>();

    let overallHistoricalSent = 0;
    let overallHistoricalSold = 0;
    let overallWeightedDays = 0;
    let overallSoldWithDays = 0;

    for (const row of estimateSentHistoryRows) {
      const recordType = row.record_type ?? "Other";
      const historicalSent = parseInt(row.historical_sent, 10) || 0;
      const historicalSold = parseInt(row.historical_sold, 10) || 0;
      const avgDaysToClose = row.avg_days_to_close === null ? null : parseFloat(row.avg_days_to_close);
      const closeRate = historicalSent > 0 ? historicalSold / historicalSent : 0.2;

      overallHistoricalSent += historicalSent;
      overallHistoricalSold += historicalSold;
      if (avgDaysToClose !== null && historicalSold > 0) {
        overallWeightedDays += avgDaysToClose * historicalSold;
        overallSoldWithDays += historicalSold;
      }

      historyByGroup.set(cohortKey(recordType, row.trade), {
        historicalSent,
        historicalSold,
        closeRate: clamp(closeRate, 0.05, 0.95),
        avgDaysToClose: avgDaysToClose === null ? null : round1(Math.max(avgDaysToClose, 1)),
        confidence: confidenceForSample(historicalSent),
      });
    }

    const fallbackCloseRate = overallHistoricalSent > 0
      ? clamp(overallHistoricalSold / overallHistoricalSent, 0.05, 0.95)
      : 0.2;
    const fallbackAvgDays = overallSoldWithDays > 0
      ? round1(overallWeightedDays / overallSoldWithDays)
      : 14;

    const estimateSentJobs: EstimateSentForecastJob[] = estimateSentCurrentRows.map((row) => {
      const recordType = row.record_type ?? "Other";
      const model = historyByGroup.get(cohortKey(recordType, row.trade)) ?? {
        historicalSent: overallHistoricalSent,
        historicalSold: overallHistoricalSold,
        closeRate: fallbackCloseRate,
        avgDaysToClose: fallbackAvgDays,
        confidence: confidenceForSample(overallHistoricalSent),
      };
      const estimateValue = parseFloat(row.estimate_value) || 0;
      const sentTime = row.sent_at ? new Date(row.sent_at).getTime() : Date.now();
      const daysSinceSent = Math.max(0, Math.floor((Date.now() - sentTime) / (1000 * 60 * 60 * 24)));
      const probability = estimateProbability(model.closeRate, daysSinceSent, model.avgDaysToClose);

      return {
        jobJnid: row.job_jnid,
        jobName: row.job_name,
        recordType,
        trade: row.trade,
        estimateValue: roundMoney(estimateValue),
        daysSinceSent,
        closeRate: round1(model.closeRate * 100),
        probability: round1(probability * 100),
        weightedRevenue: roundMoney(estimateValue * probability),
        avgDaysToClose: model.avgDaysToClose,
        isPastAverageCloseDays: model.avgDaysToClose !== null && daysSinceSent > model.avgDaysToClose,
        jobUrl: `${JOBNIMBUS_BASE_URL}${row.job_jnid}`,
      };
    });

    const groupMap = new Map<string, EstimateSentForecastGroup>();
    for (const job of estimateSentJobs) {
      const key = cohortKey(job.recordType, job.trade);
      const model = historyByGroup.get(key) ?? {
        historicalSent: overallHistoricalSent,
        historicalSold: overallHistoricalSold,
        closeRate: fallbackCloseRate,
        avgDaysToClose: fallbackAvgDays,
        confidence: confidenceForSample(overallHistoricalSent),
      };
      const existing = groupMap.get(key) ?? {
        recordType: job.recordType,
        trade: job.trade,
        estimateCount: 0,
        estimateValue: 0,
        weightedRevenue: 0,
        historicalSent: model.historicalSent,
        historicalSold: model.historicalSold,
        closeRate: round1(model.closeRate * 100),
        avgDaysToClose: model.avgDaysToClose,
        avgCurrentAgeDays: 0,
        staleCount: 0,
        confidence: model.confidence,
      };
      existing.estimateCount += 1;
      existing.estimateValue = roundMoney(existing.estimateValue + job.estimateValue);
      existing.weightedRevenue = roundMoney(existing.weightedRevenue + job.weightedRevenue);
      existing.avgCurrentAgeDays += job.daysSinceSent;
      existing.staleCount += job.isPastAverageCloseDays ? 1 : 0;
      groupMap.set(key, existing);
    }

    const estimateSentGroups = Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        avgCurrentAgeDays: group.estimateCount > 0 ? round1(group.avgCurrentAgeDays / group.estimateCount) : 0,
      }))
      .sort((a, b) => b.weightedRevenue - a.weightedRevenue);

    const estimateSentWeighted = estimateSentJobs.reduce((sum, job) => sum + job.weightedRevenue, 0);
    const estimateSentRawValue = estimateSentJobs.reduce((sum, job) => sum + job.estimateValue, 0);

    // Total weighted inflows
    const totalWeightedInflows = expectedCollections.reduce(
      (sum, c) => sum + c.weightedAmount,
      0
    );

    // 4. Projected outflows from material costs
    const avgMonthlyMaterials = parseFloat(
      recentMaterialCosts[0]?.avg_monthly ?? "0"
    );

    // ── Build weekly projections ──────────────────────────────────────────

    function buildProjections(
      inflowMultiplier: number,
      outflowMultiplier: number
    ): CashFlowWeek[] {
      const projections: CashFlowWeek[] = [];
      let runningBalance = currentCash;

      for (let w = 0; w < Math.ceil(weeks); w++) {
        const weekStart = startOfWeek(addWeeks(now, w + 1), {
          weekStartsOn: 1,
        });

        // Distribute weighted collections evenly across weeks (simplified)
        const weeklyInflow =
          ((totalWeightedInflows + (soldPipelineWeighted + estimateSentWeighted) / 4) /
            Math.ceil(weeks)) *
          inflowMultiplier;
        const weeklyOutflow = weeklyBurn * outflowMultiplier;
        const netCash = weeklyInflow - weeklyOutflow;
        runningBalance += netCash;

        projections.push({
          weekStart: format(weekStart, "yyyy-MM-dd"),
          inflows: Math.round(weeklyInflow),
          outflows: Math.round(weeklyOutflow),
          netCash: Math.round(netCash),
          runningBalance: Math.round(runningBalance),
        });
      }

      return projections;
    }

    const realisticProjections = buildProjections(1.0, 1.0);
    const optimisticProjections = buildProjections(1.2, 0.9);
    const conservativeProjections = buildProjections(0.7, 1.15);

    const runwayWeeks =
      weeklyBurn > 0 ? Math.round((currentCash / weeklyBurn) * 10) / 10 : 999;

    function calcScenarioRunway(projections: CashFlowWeek[]): number {
      for (let i = 0; i < projections.length; i++) {
        if (projections[i].runningBalance <= 0) return i + 1;
      }
      return projections.length;
    }

    const metrics: CashFlowMetrics = {
      currentCash: Math.round(currentCash),
      burnRate: Math.round(burnRate),
      runwayWeeks,
      revenueForecast: {
        arWeighted: Math.round(totalWeightedInflows),
        soldPipelineWeighted: Math.round(soldPipelineWeighted),
        estimateSentWeighted: Math.round(estimateSentWeighted),
        projectedRevenue: Math.round(totalWeightedInflows + soldPipelineWeighted + estimateSentWeighted),
        estimateSentRawValue: Math.round(estimateSentRawValue),
        estimateSentJobCount: estimateSentJobs.length,
        modelNotes: [
          "AR is open JobNimbus invoice balance probability-weighted by invoice age and segment.",
          "Sold/post-sold work uses current JobNimbus stage weights. It is stronger than Estimate Sent, weaker than AR.",
          "Estimate Sent revenue uses historical close rate and average days-to-close by record type + inferred trade.",
          "After an estimate passes its average close window, probability decays by age instead of dropping to zero.",
        ],
        estimateSentGroups,
        estimateSentJobs: estimateSentJobs
          .sort((a, b) => b.weightedRevenue - a.weightedRevenue)
          .slice(0, 15),
      },
      weeklyProjections: realisticProjections,
      scenarios: {
        optimistic: {
          label: "Optimistic",
          runwayWeeks: calcScenarioRunway(optimisticProjections),
          endingCash:
            optimisticProjections[optimisticProjections.length - 1]
              ?.runningBalance ?? currentCash,
          projections: optimisticProjections,
        },
        realistic: {
          label: "Realistic",
          runwayWeeks: calcScenarioRunway(realisticProjections),
          endingCash:
            realisticProjections[realisticProjections.length - 1]
              ?.runningBalance ?? currentCash,
          projections: realisticProjections,
        },
        conservative: {
          label: "Conservative",
          runwayWeeks: calcScenarioRunway(conservativeProjections),
          endingCash:
            conservativeProjections[conservativeProjections.length - 1]
              ?.runningBalance ?? currentCash,
          projections: conservativeProjections,
        },
      },
      expectedCollections: expectedCollections
        .sort((a, b) => b.weightedAmount - a.weightedAmount)
        .slice(0, 20),
    };

    return NextResponse.json(metrics);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Cash Flow API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
