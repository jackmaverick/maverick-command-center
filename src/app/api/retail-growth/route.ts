import { NextResponse } from "next/server";
import { startOfWeek, subWeeks } from "date-fns";
import { query } from "@/lib/db";
import { SEGMENT_SQL } from "@/lib/segment";
import { toUnixSeconds } from "@/lib/dates";

const INVOICED_STATUSES = ["Sent", "Open", "Closed"] as const;
const MONTHLY_GROWTH_TARGET = 0.11;

interface WeeklySegmentRow {
  week_start: Date | string;
  segment: string;
  invoice_count: string;
  invoiced: string;
}

interface WeekSummary {
  weekStart: string;
  retail: number;
  insurance: number;
  repairs: number;
  realEstate: number;
  other: number;
  total: number;
  invoiceCount: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function asDateOnly(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function emptyWeek(weekStart: string): WeekSummary {
  return {
    weekStart,
    retail: 0,
    insurance: 0,
    repairs: 0,
    realEstate: 0,
    other: 0,
    total: 0,
    invoiceCount: 0,
  };
}

function getStatus(retail: number, goal: number): "green" | "yellow" | "red" {
  if (goal <= 0) return "yellow";
  const pct = retail / goal;
  if (pct >= 1) return "green";
  if (pct >= 0.85) return "yellow";
  return "red";
}

export async function GET() {
  try {
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const historyStart = subWeeks(currentWeekStart, 4);
    const nextWeekStart = subWeeks(currentWeekStart, -1);

    const rows = await query<WeeklySegmentRow>(
      `WITH invoice_base AS (
         SELECT
           i.jnid,
           i.job_jnid,
           i.total,
           i.status_name,
           i.jn_date_created,
           COALESCE(NULLIF(i.date_invoice, 0), i.jn_date_created) AS effective_invoice_date,
           ${SEGMENT_SQL} AS segment,
           j.name AS job_name,
           ROW_NUMBER() OVER (
             PARTITION BY
               i.job_jnid,
               ROUND(COALESCE(i.total, 0)::numeric, 2),
               to_timestamp(COALESCE(NULLIF(i.date_invoice, 0), i.jn_date_created))::date
             ORDER BY
               CASE i.status_name WHEN 'Closed' THEN 3 WHEN 'Open' THEN 2 WHEN 'Sent' THEN 1 ELSE 0 END DESC,
               CASE WHEN i.date_invoice IS NOT NULL AND i.date_invoice > 0 THEN 1 ELSE 0 END DESC,
               i.jn_date_created DESC
           ) AS duplicate_rank
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.status_name = ANY($1::text[])
           AND COALESCE(i.total, 0) > 0
           AND COALESCE(NULLIF(i.date_invoice, 0), i.jn_date_created) >= $2
           AND COALESCE(NULLIF(i.date_invoice, 0), i.jn_date_created) < $3
           AND COALESCE(j.name, '') NOT ILIKE '%test%'
       )
       SELECT
         date_trunc('week', to_timestamp(effective_invoice_date))::date AS week_start,
         segment,
         COUNT(*)::text AS invoice_count,
         COALESCE(SUM(total), 0)::text AS invoiced
       FROM invoice_base
       WHERE duplicate_rank = 1
       GROUP BY week_start, segment
       ORDER BY week_start ASC, segment ASC`,
      [INVOICED_STATUSES, toUnixSeconds(historyStart), toUnixSeconds(nextWeekStart)]
    );

    const weeksByStart = new Map<string, WeekSummary>();
    for (let i = 4; i >= 0; i -= 1) {
      const weekStart = subWeeks(currentWeekStart, i);
      const key = weekStart.toISOString().slice(0, 10);
      weeksByStart.set(key, emptyWeek(key));
    }

    for (const row of rows) {
      const key = asDateOnly(row.week_start);
      const week = weeksByStart.get(key) ?? emptyWeek(key);
      const value = parseFloat(row.invoiced ?? "0");
      const invoiceCount = parseInt(row.invoice_count ?? "0", 10);

      if (row.segment === "retail") week.retail += value;
      else if (row.segment === "insurance") week.insurance += value;
      else if (row.segment === "repairs") week.repairs += value;
      else if (row.segment === "real_estate") week.realEstate += value;
      else week.other += value;

      week.total += value;
      week.invoiceCount += invoiceCount;
      weeksByStart.set(key, week);
    }

    const weeks = Array.from(weeksByStart.values()).map((week) => ({
      ...week,
      retail: roundCurrency(week.retail),
      insurance: roundCurrency(week.insurance),
      repairs: roundCurrency(week.repairs),
      realEstate: roundCurrency(week.realEstate),
      other: roundCurrency(week.other),
      total: roundCurrency(week.total),
    }));

    const currentWeek = weeks[weeks.length - 1];
    const priorFullWeeks = weeks.slice(0, -1);
    const priorRetailAverage = priorFullWeeks.length
      ? priorFullWeeks.reduce((sum, week) => sum + week.retail, 0) / priorFullWeeks.length
      : 0;
    const retailWeeklyGoal = priorRetailAverage * (1 + MONTHLY_GROWTH_TARGET);
    const retailPacePercent = retailWeeklyGoal > 0 ? (currentWeek.retail / retailWeeklyGoal) * 100 : 0;
    const retailShare = currentWeek.total > 0 ? (currentWeek.retail / currentWeek.total) * 100 : 0;
    const insuranceAndOtherBump = currentWeek.total - currentWeek.retail;

    return NextResponse.json({
      generatedAt: now.toISOString(),
      target: {
        monthlyGrowthRate: MONTHLY_GROWTH_TARGET,
        basis: "Prior 4 full weeks retail invoice average, plus 11% growth",
        retailWeeklyGoal: roundCurrency(retailWeeklyGoal),
        priorRetailAverage: roundCurrency(priorRetailAverage),
      },
      currentWeek: {
        ...currentWeek,
        retailPacePercent: Math.round(retailPacePercent * 10) / 10,
        retailShare: Math.round(retailShare * 10) / 10,
        insuranceAndOtherBump: roundCurrency(insuranceAndOtherBump),
        status: getStatus(currentWeek.retail, retailWeeklyGoal),
      },
      history: priorFullWeeks,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Retail Growth API] Error:", errorMsg);
    if (error instanceof Error) console.error(error.stack);

    return NextResponse.json(
      {
        error: "Failed to fetch retail growth metrics",
        details: errorMsg,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
