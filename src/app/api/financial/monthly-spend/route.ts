import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { MonthlySpend, MonthlySpendCategory } from "@/types";

// Actual cash leaving the bank/cards, from QBO Purchase transactions
// (checks, debit card, EFT, cash). This is cash-basis spend -- distinct
// from the accrual-basis "expenses" shown on the P&L tab, which counts
// costs when incurred rather than when money actually moves.

const DEFAULT_MONTHS = 24;

function addMonthsKey(month: string, offset: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const monthNum = Number(month.split("-")[1]);
  return [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][monthNum - 1] ?? month;
}

type PurchaseRow = {
  ym: string;
  category: string;
  amount: string;
};

type AccountRow = {
  ym: string;
  account_name: string | null;
  amount: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const months = Math.min(
      24,
      Math.max(1, Number(searchParams.get("months")) || DEFAULT_MONTHS)
    );
    const horizonDays = Math.min(
      90,
      Math.max(30, Number(searchParams.get("horizon")) || 90)
    );

    const byCategory = await query<PurchaseRow>(
      `SELECT
         to_char(txn_date, 'YYYY-MM') AS ym,
         COALESCE(
           line->'AccountBasedExpenseLineDetail'->'AccountRef'->>'name',
           'Uncategorized'
         ) AS category,
         SUM((line->>'Amount')::numeric) AS amount
       FROM qbo_purchases,
            jsonb_array_elements(line_details) AS line
       WHERE txn_date >= (CURRENT_DATE - ($1 || ' months')::interval)
       GROUP BY 1, 2
       ORDER BY 1 DESC, amount DESC`,
      [months]
    );

    const byAccount = await query<AccountRow>(
      `SELECT
         to_char(txn_date, 'YYYY-MM') AS ym,
         account_name,
         SUM(total_amount) AS amount
       FROM qbo_purchases
       WHERE txn_date >= (CURRENT_DATE - ($1 || ' months')::interval)
       GROUP BY 1, 2
       ORDER BY 1 DESC, amount DESC`,
      [months]
    );

    const monthMap = new Map<string, MonthlySpend>();

    for (const row of byAccount) {
      const existing = monthMap.get(row.ym) ?? {
        month: row.ym,
        total: 0,
        byAccount: [],
        categories: [],
      };
      existing.total += Number(row.amount);
      existing.byAccount.push({
        name: row.account_name ?? "Unknown account",
        amount: Number(row.amount),
      });
      monthMap.set(row.ym, existing);
    }

    for (const row of byCategory) {
      const existing = monthMap.get(row.ym);
      if (!existing) continue;
      existing.categories.push({
        name: row.category,
        amount: Number(row.amount),
      });
    }

    const result: MonthlySpend[] = Array.from(monthMap.values())
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .map((m) => ({
        ...m,
        categories: (m.categories as MonthlySpendCategory[]).sort(
          (a, b) => b.amount - a.amount
        ),
        byAccount: m.byAccount.sort((a, b) => b.amount - a.amount),
      }));

    const currentMonth = result[0] ?? null;
    const priorMonth = result[1] ?? null;
    const momDeltaPct =
      currentMonth && priorMonth && priorMonth.total > 0
        ? ((currentMonth.total - priorMonth.total) / priorMonth.total) * 100
        : null;

    const avgMonthlySpend =
      result.length > 0
        ? result.reduce((s, m) => s + m.total, 0) / result.length
        : 0;

    const monthTotals = new Map(result.map((m) => [m.month, m.total]));
    const latestMonth = currentMonth?.month ?? null;
    const latestYear = latestMonth ? Number(latestMonth.slice(0, 4)) : null;
    const currentYearMonths = latestYear
      ? result
          .filter((m) => m.month.startsWith(`${latestYear}-`))
          .sort((a, b) => (a.month > b.month ? 1 : -1))
      : [];
    const priorYearMonths = latestYear
      ? result
          .filter((m) => m.month.startsWith(`${latestYear - 1}-`))
          .sort((a, b) => (a.month > b.month ? 1 : -1))
      : [];

    const yearOverYear = latestYear
      ? Array.from({ length: 12 }, (_, idx) => {
          const month = `${latestYear}-${String(idx + 1).padStart(2, "0")}`;
          const priorMonth = `${latestYear - 1}-${String(idx + 1).padStart(2, "0")}`;
          const currentYearTotal = monthTotals.get(month) ?? null;
          const priorYearTotal = monthTotals.get(priorMonth) ?? null;
          const variance =
            currentYearTotal !== null && priorYearTotal !== null
              ? currentYearTotal - priorYearTotal
              : null;
          const variancePct =
            variance !== null && priorYearTotal && priorYearTotal > 0
              ? (variance / priorYearTotal) * 100
              : null;

          return {
            month,
            monthLabel: monthLabel(month),
            currentYearTotal,
            priorYearTotal,
            variance,
            variancePct,
          };
        })
      : [];

    const monthsCovered = Math.ceil(horizonDays / 30);
    const sourceMonths = latestMonth
      ? Array.from({ length: monthsCovered }, (_, idx) =>
          addMonthsKey(addMonthsKey(latestMonth, -12), idx)
        )
      : [];
    const lastYearSeasonalTotal = sourceMonths.reduce(
      (sum, ym) => sum + (monthTotals.get(ym) ?? 0),
      0
    );
    const lastYearSeasonalMonthlyAvg =
      sourceMonths.length > 0 ? lastYearSeasonalTotal / sourceMonths.length : 0;
    const recentCompleteMonths = result
      .filter((m) => m.month !== latestMonth)
      .slice(0, 3);
    const currentRunRate =
      recentCompleteMonths.length > 0
        ? recentCompleteMonths.reduce((s, m) => s + m.total, 0) /
          recentCompleteMonths.length
        : avgMonthlySpend;
    const blendedMonthlyEstimate =
      lastYearSeasonalMonthlyAvg > 0
        ? (currentRunRate + lastYearSeasonalMonthlyAvg) / 2
        : currentRunRate;
    const projectedExpense = blendedMonthlyEstimate * (horizonDays / 30);

    return NextResponse.json({
      months: result,
      currentMonthTotal: currentMonth?.total ?? 0,
      priorMonthTotal: priorMonth?.total ?? 0,
      momDeltaPct,
      avgMonthlySpend,
      currentYearMonths,
      priorYearMonths,
      yearOverYear,
      projection: {
        horizonDays,
        monthsCovered,
        currentRunRate,
        lastYearSeasonalTotal,
        lastYearSeasonalMonthlyAvg,
        blendedMonthlyEstimate,
        projectedExpense,
        sourceMonths,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Monthly Spend API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
