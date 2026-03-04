import { NextRequest, NextResponse } from "next/server";
import { qboReport, getQBOConnection } from "@/lib/quickbooks";
import type {
  QBOReportResponse,
  QBOReportRow,
} from "@/lib/quickbooks";
import type { PnLMetrics, PnLMonthlyEntry, ExpenseCategory } from "@/types";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subYears,
} from "date-fns";

type PnLPeriod = "month" | "quarter" | "ytd";

function getDateRange(period: PnLPeriod): {
  start: Date;
  end: Date;
  label: string;
  prevStart: Date;
  prevEnd: Date;
} {
  const now = new Date();
  switch (period) {
    case "month":
      return {
        start: startOfMonth(now),
        end: now,
        label: "This Month",
        prevStart: startOfMonth(subMonths(now, 1)),
        prevEnd: endOfMonth(subMonths(now, 1)),
      };
    case "quarter":
      return {
        start: startOfQuarter(now),
        end: now,
        label: "This Quarter",
        prevStart: startOfQuarter(subMonths(now, 3)),
        prevEnd: endOfMonth(subMonths(startOfQuarter(now), 1)),
      };
    case "ytd":
      return {
        start: startOfYear(now),
        end: now,
        label: "Year to Date",
        prevStart: startOfYear(subYears(now, 1)),
        prevEnd: subYears(now, 0), // will use same day last year
      };
  }
}

function fmt(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Parse the P&L report to extract total revenue, expenses, net income.
 * QBO P&L structure: rows with type "Section" for Income/Expenses/NetIncome.
 */
function parsePnLTotals(report: QBOReportResponse): {
  revenue: number;
  expenses: number;
  netIncome: number;
  expenseCategories: ExpenseCategory[];
} {
  let revenue = 0;
  let expenses = 0;
  let netIncome = 0;
  const expenseCategories: ExpenseCategory[] = [];

  if (!report.Rows?.Row) {
    console.log("[P&L Parse] No rows in report");
    return { revenue, expenses, netIncome, expenseCategories };
  }

  // Log all section groups for debugging
  const groups = report.Rows.Row.map((r) => r.group).filter(Boolean);
  console.log("[P&L Parse] Report sections:", groups.join(", "));

  for (const section of report.Rows.Row) {
    const group = section.group;

    if (group === "Income" && section.Summary?.ColData) {
      revenue = parseFloat(section.Summary.ColData[1]?.value ?? "0") || 0;
      console.log("[P&L Parse] Income:", revenue);
    }

    if (group === "OtherIncome" && section.Summary?.ColData) {
      const otherIncome = parseFloat(section.Summary.ColData[1]?.value ?? "0") || 0;
      revenue += otherIncome;
      console.log("[P&L Parse] OtherIncome:", otherIncome, "→ Total revenue:", revenue);
    }

    if (group === "CostOfGoodsSold" && section.Summary?.ColData) {
      const cogs = parseFloat(section.Summary.ColData[1]?.value ?? "0") || 0;
      expenses += cogs;
      console.log("[P&L Parse] COGS:", cogs);
      // Extract COGS subcategories
      if (section.Rows?.Row) {
        for (const row of section.Rows.Row) {
          if (row.ColData) {
            const name = row.ColData[0]?.value ?? "Cost of Goods";
            const amount = parseFloat(row.ColData[1]?.value ?? "0") || 0;
            if (amount !== 0) {
              expenseCategories.push({ name, amount, percent: 0 });
            }
          }
        }
      }
    }

    if (group === "Expenses" || group === "OtherExpenses") {
      if (section.Summary?.ColData) {
        const sectionExpenses = parseFloat(section.Summary.ColData[1]?.value ?? "0") || 0;
        expenses += sectionExpenses;
        console.log(`[P&L Parse] ${group}:`, sectionExpenses, "→ Total expenses:", expenses);
      }
      // Extract expense subcategories
      if (section.Rows?.Row) {
        for (const row of section.Rows.Row) {
          if (row.ColData) {
            const name = row.ColData[0]?.value ?? "Other";
            const amount = parseFloat(row.ColData[1]?.value ?? "0") || 0;
            if (amount !== 0) {
              expenseCategories.push({ name, amount, percent: 0 });
            }
          }
          // Handle nested sections (sub-accounts)
          if (row.type === "Section" && row.Header?.ColData && row.Summary?.ColData) {
            const name = row.Header.ColData[0]?.value ?? "Other";
            const amount = parseFloat(row.Summary.ColData[1]?.value ?? "0") || 0;
            const subcategories: { name: string; amount: number }[] = [];
            if (row.Rows?.Row) {
              for (const sub of row.Rows.Row) {
                if (sub.ColData) {
                  const subName = sub.ColData[0]?.value ?? "";
                  const subAmt = parseFloat(sub.ColData[1]?.value ?? "0") || 0;
                  if (subAmt !== 0) subcategories.push({ name: subName, amount: subAmt });
                }
              }
            }
            if (amount !== 0) {
              expenseCategories.push({ name, amount, percent: 0, subcategories });
            }
          }
        }
      }
    }

    if (group === "NetIncome" && section.Summary?.ColData) {
      netIncome = parseFloat(section.Summary.ColData[1]?.value ?? "0") || 0;
      console.log("[P&L Parse] NetIncome:", netIncome);
    }
  }

  // Calculate expense percentages
  const totalExpenses = expenseCategories.reduce((sum, c) => sum + Math.abs(c.amount), 0);
  for (const cat of expenseCategories) {
    cat.percent = totalExpenses > 0 ? Math.round((Math.abs(cat.amount) / totalExpenses) * 1000) / 10 : 0;
  }

  // Sort by absolute amount descending
  expenseCategories.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return { revenue, expenses, netIncome, expenseCategories };
}

/**
 * Parse monthly P&L report into trend data.
 */
function parseMonthlyTrend(report: QBOReportResponse): PnLMonthlyEntry[] {
  const entries: PnLMonthlyEntry[] = [];

  if (!report.Columns?.Column || !report.Rows?.Row) return entries;

  // Monthly columns start at index 1 (index 0 is the label column)
  const columns = report.Columns.Column.slice(1);
  const monthLabels = columns.map((col) => {
    // Extract month from metadata or title
    const metaValue = col.MetaData?.find((m) => m.Name === "StartDate")?.Value;
    if (metaValue) {
      return format(new Date(metaValue), "MMM yyyy");
    }
    return col.ColTitle;
  });

  let revenueRow: number[] = [];
  let expenseRow: number[] = [];
  let netIncomeRow: number[] = [];

  for (const section of report.Rows.Row) {
    const group = section.group;

    if ((group === "Income" || group === "OtherIncome") && section.Summary?.ColData) {
      const values = section.Summary.ColData.slice(1).map(
        (d) => parseFloat(d.value ?? "0") || 0
      );
      if (revenueRow.length === 0) {
        revenueRow = values;
      } else {
        for (let i = 0; i < values.length; i++) {
          revenueRow[i] = (revenueRow[i] ?? 0) + values[i];
        }
      }
    }
    if ((group === "Expenses" || group === "OtherExpenses" || group === "CostOfGoodsSold") && section.Summary?.ColData) {
      const values = section.Summary.ColData.slice(1).map(
        (d) => parseFloat(d.value ?? "0") || 0
      );
      if (expenseRow.length === 0) {
        expenseRow = values;
      } else {
        // Add OtherExpenses to Expenses
        for (let i = 0; i < values.length; i++) {
          expenseRow[i] = (expenseRow[i] ?? 0) + values[i];
        }
      }
    }
    if (group === "NetIncome" && section.Summary?.ColData) {
      netIncomeRow = section.Summary.ColData.slice(1).map(
        (d) => parseFloat(d.value ?? "0") || 0
      );
    }
  }

  for (let i = 0; i < monthLabels.length; i++) {
    entries.push({
      month: monthLabels[i],
      revenue: revenueRow[i] ?? 0,
      expenses: expenseRow[i] ?? 0,
      netIncome: netIncomeRow[i] ?? 0,
    });
  }

  return entries;
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
    const periodParam = (searchParams.get("period") ?? "month") as PnLPeriod;
    const period = ["month", "quarter", "ytd"].includes(periodParam)
      ? periodParam
      : "month";

    const range = getDateRange(period as PnLPeriod);

    // Fetch current period P&L, previous period P&L, monthly trend, and YoY in parallel
    const now = new Date();
    const yearAgoStart = subYears(range.start, 1);
    const yearAgoEnd = subYears(range.end, 1);

    const [currentReport, prevReport, monthlyReport, yoyReport] =
      await Promise.all([
        // Current period P&L
        qboReport("ProfitAndLoss", {
          start_date: fmt(range.start),
          end_date: fmt(range.end),
        }),
        // Previous period P&L
        qboReport("ProfitAndLoss", {
          start_date: fmt(range.prevStart),
          end_date: fmt(range.prevEnd),
        }),
        // Monthly breakdown (YTD)
        qboReport("ProfitAndLoss", {
          start_date: fmt(startOfYear(now)),
          end_date: fmt(now),
          summarize_column_by: "Month",
        }),
        // Same period last year
        qboReport("ProfitAndLoss", {
          start_date: fmt(yearAgoStart),
          end_date: fmt(yearAgoEnd),
        }),
      ]);

    console.log("[P&L API] Current report period:", fmt(range.start), "to", fmt(range.end));
    console.log("[P&L API] Current report has rows:", !!currentReport.Rows?.Row, "count:", currentReport.Rows?.Row?.length ?? 0);

    const current = parsePnLTotals(currentReport);
    const previous = parsePnLTotals(prevReport);
    const monthlyTrend = parseMonthlyTrend(monthlyReport);
    const yoyData = parsePnLTotals(yoyReport);

    // Calculate deltas
    const calcDelta = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr > 0 ? 100 : null;
      return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
    };

    const metrics: PnLMetrics = {
      period: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label,
      },
      revenue: current.revenue,
      expenses: current.expenses,
      netIncome: current.netIncome,
      revenueDelta: calcDelta(current.revenue, previous.revenue),
      expensesDelta: calcDelta(current.expenses, previous.expenses),
      netIncomeDelta: calcDelta(current.netIncome, previous.netIncome),
      monthlyTrend,
      yoyComparison: {
        current: current.netIncome,
        previous: yoyData.netIncome,
        delta: calcDelta(current.netIncome, yoyData.netIncome) ?? 0,
      },
      expenseCategories: current.expenseCategories,
    };

    return NextResponse.json(metrics);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[P&L API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
