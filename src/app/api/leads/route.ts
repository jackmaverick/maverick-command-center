import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { toUnixSeconds } from "@/lib/dates";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TIMEZONE = "America/Chicago";
const ACTIVE_REAL_JOB_WHERE = `
  j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;

interface MonthData {
  month: string; // YYYY-MM
  monthLabel: string; // "January 2025"
  leads: number;
  leadsPriorYear: number;
  yoyDelta: number | null; // percentage change
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get("months");
    const months = monthsParam ? Math.max(1, Math.min(24, parseInt(monthsParam, 10))) : 6;

    // Get current time in America/Chicago timezone
    const nowChicago = toZonedTime(new Date(), TIMEZONE);
    
    // Build array of month ranges (last N months, most recent first)
    const monthRanges: Array<{
      month: string;
      monthLabel: string;
      start: Date;
      end: Date;
      priorYearStart: Date;
      priorYearEnd: Date;
    }> = [];

    for (let i = 0; i < months; i++) {
      const monthDate = subMonths(nowChicago, i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      
      // Prior year same month
      const priorYearDate = subMonths(monthDate, 12);
      const priorYearStart = startOfMonth(priorYearDate);
      const priorYearEnd = endOfMonth(priorYearDate);

      monthRanges.push({
        month: format(start, "yyyy-MM"),
        monthLabel: format(start, "MMMM yyyy"),
        start,
        end,
        priorYearStart,
        priorYearEnd,
      });
    }

    // Query leads for each month range
    const results: MonthData[] = [];

    for (const range of monthRanges) {
      const startUnix = toUnixSeconds(range.start);
      const endUnix = toUnixSeconds(range.end);
      const priorStartUnix = toUnixSeconds(range.priorYearStart);
      const priorEndUnix = toUnixSeconds(range.priorYearEnd);

      // Query current year month
      const currentRows = await query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND ${ACTIVE_REAL_JOB_WHERE}`,
        [startUnix, endUnix]
      );

      // Query prior year month
      const priorRows = await query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created < $2
           AND ${ACTIVE_REAL_JOB_WHERE}`,
        [priorStartUnix, priorEndUnix]
      );

      const leads = parseInt(currentRows[0]?.count ?? "0", 10);
      const leadsPriorYear = parseInt(priorRows[0]?.count ?? "0", 10);

      // Calculate YoY delta
      let yoyDelta: number | null = null;
      if (leadsPriorYear > 0) {
        yoyDelta = ((leads - leadsPriorYear) / leadsPriorYear) * 100;
      } else if (leads > 0) {
        yoyDelta = 100; // Went from 0 to some leads
      }

      results.push({
        month: range.month,
        monthLabel: range.monthLabel,
        leads,
        leadsPriorYear,
        yoyDelta: yoyDelta !== null ? Math.round(yoyDelta * 10) / 10 : null,
      });
    }

    // Reverse to show oldest to newest
    results.reverse();

    return NextResponse.json({
      months: results,
      timezone: TIMEZONE,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN';

    console.error("[Leads API] Error caught");
    console.error("[Leads API] Error message:", errorMsg);
    console.error("[Leads API] Error code:", errorCode);
    if (error instanceof Error) {
      console.error("[Leads API] Error stack:", error.stack);
    }

    return NextResponse.json(
      {
        error: "Failed to fetch leads data",
        details: errorMsg,
        code: errorCode,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
