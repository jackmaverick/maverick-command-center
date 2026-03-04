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
} from "@/types";

type Horizon = "30" | "60" | "90";

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

    const pipelineInflows = pipelineJobs.reduce((sum, job) => {
      const weight = stageWeights[job.status_name] ?? 0.1;
      return sum + parseFloat(job.approved_estimate_total) * weight;
    }, 0);

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
          ((totalWeightedInflows + pipelineInflows / 4) /
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
