import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange, isValidPeriodKey, toUnixSeconds } from "@/lib/dates";
import { segmentWhereClause } from "@/lib/segment";
import { LOSS_STATUSES } from "@/lib/constants";
import type { Segment } from "@/lib/constants";

const VALID_SEGMENTS: Segment[] = [
  "real_estate", "retail", "insurance", "repairs", "warranty",
];
const WON_STATUSES = ["Sold Job", "Production Ready", "In Progress", "Insurance Pending", "Future Work", "Needs Rescheduling", "Invoiced", "Final Invoicing", "Pending Final Payment", "Job Close Out", "Paid & Closed", "All Work Completed", "All Work Complete", "Job Completed", "Warranty Complete"];
const INVOICED_STATUSES = ["Sent", "Open", "Closed"];
const ACTIVE_REAL_JOB_WHERE = `
  j.is_active = true
  AND j.is_archived = false
  AND COALESCE(j.name, '') !~* '(test|dummy|demo|sample|verification|scout_test)'
  AND COALESCE(j.primary_contact_name, '') !~* '(test|dummy|demo|sample|verification)'
`;
const ROOF_ONLY_WHERE = `j.cf_string_24 = '🏠 Y'`;
const EFFECTIVE_INVOICE_DATE = "COALESCE(i.date_invoice, i.jn_date_created)";

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

function buildJobFilter(startUnix: number, endUnix: number, segment: Segment | null, repJnid: string | null, roofOnly: boolean): { where: string; params: unknown[]; nextIdx: number } {
  const conditions = [`j.jn_date_created >= $1`, `j.jn_date_created < $2`, ACTIVE_REAL_JOB_WHERE];
  const params: unknown[] = [startUnix, endUnix];
  let idx = 3;
  if (roofOnly) { conditions.push(ROOF_ONLY_WHERE); }
  if (segment) { conditions.push(segmentWhereClause(idx)); params.push(segment); idx++; }
  if (repJnid === "unassigned") {
    conditions.push("j.sales_rep_jnid IS NULL");
  } else if (repJnid) {
    conditions.push(`j.sales_rep_jnid = $${idx}`);
    params.push(repJnid);
    idx++;
  }
  return { where: conditions.join(" AND "), params, nextIdx: idx };
}

function buildInvoiceFilter(startUnix: number, endUnix: number, segment: Segment | null, repJnid: string | null, roofOnly: boolean): { where: string; params: unknown[]; nextIdx: number } {
  const conditions = [
    `i.is_active = true`,
    `COALESCE(i.status_name, i.status::text, '') = ANY($1::text[])`,
    `${EFFECTIVE_INVOICE_DATE} >= $2`,
    `${EFFECTIVE_INVOICE_DATE} < $3`,
    ACTIVE_REAL_JOB_WHERE,
  ];
  const params: unknown[] = [INVOICED_STATUSES, startUnix, endUnix];
  let idx = 4;
  if (roofOnly) { conditions.push(ROOF_ONLY_WHERE); }
  if (segment) { conditions.push(segmentWhereClause(idx)); params.push(segment); idx++; }
  if (repJnid === "unassigned") {
    conditions.push("j.sales_rep_jnid IS NULL");
  } else if (repJnid) {
    conditions.push(`j.sales_rep_jnid = $${idx}`);
    params.push(repJnid);
    idx++;
  }
  return { where: conditions.join(" AND "), params, nextIdx: idx };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") ?? "month") as PeriodKey;
    const segment = (searchParams.get("segment") as Segment | null) || null;
    const repJnid = searchParams.get("rep_jnid") || null;
    const roofOnlyParam = searchParams.get("roofOnly");
    const roofOnly = roofOnlyParam === "1" || roofOnlyParam === "true";

    if (!isValidPeriodKey(period)) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    if (segment && !VALID_SEGMENTS.includes(segment)) return NextResponse.json({ error: "Invalid segment" }, { status: 400 });

    const range = getDateRange(period);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);
    const repConditions = [ACTIVE_REAL_JOB_WHERE];
    const repParams: unknown[] = [];
    let repParamIdx = 1;
    if (roofOnly) { repConditions.push(ROOF_ONLY_WHERE); }
    if (segment) {
      repConditions.push(segmentWhereClause(repParamIdx));
      repParams.push(segment);
      repParamIdx++;
    }
    if (repJnid === "unassigned") {
      repConditions.push("j.sales_rep_jnid IS NULL");
    } else if (repJnid) {
      repConditions.push(`j.sales_rep_jnid = $${repParamIdx}`);
      repParams.push(repJnid);
      repParamIdx++;
    }

    const repsRows = await query<{ sales_rep_jnid: string; sales_rep_name: string }>(
      `SELECT DISTINCT COALESCE(j.sales_rep_jnid, 'unassigned') AS sales_rep_jnid, COALESCE(j.sales_rep_name, 'Unassigned') AS sales_rep_name
       FROM jobs j
       WHERE ${repConditions.join(" AND ")}
       ORDER BY sales_rep_name`,
      repParams
    );

    const reps = repsRows.filter((r) => r.sales_rep_jnid && r.sales_rep_name);

    const repMetrics = await Promise.all(reps.map(async (rep) => {
      const repFilter = buildJobFilter(startUnix, endUnix, segment, rep.sales_rep_jnid, roofOnly);
      const repInvoiceFilter = buildInvoiceFilter(startUnix, endUnix, segment, rep.sales_rep_jnid, roofOnly);

      const [totalRes, wonRes, lostRes, revenueRes] = await Promise.all([
        query<{ count: string }>(`SELECT COUNT(*) AS count FROM jobs j WHERE ${repFilter.where}`, repFilter.params),
        query<{ count: string }>(`SELECT COUNT(*) AS count FROM jobs j WHERE ${repFilter.where} AND j.status_name = ANY($${repFilter.nextIdx}::text[])`, [...repFilter.params, WON_STATUSES]),
        query<{ count: string }>(`SELECT COUNT(*) AS count FROM jobs j WHERE ${repFilter.where} AND j.status_name = ANY($${repFilter.nextIdx}::text[])`, [...repFilter.params, LOSS_STATUSES]),
        query<{ total: string }>(`SELECT COALESCE(SUM(i.total), 0) AS total FROM invoices i JOIN jobs j ON j.jnid = i.job_jnid WHERE ${repInvoiceFilter.where}`, repInvoiceFilter.params),
      ]);

      const totalJobs = parseInt(totalRes[0]?.count ?? "0", 10);
      const wonJobs = parseInt(wonRes[0]?.count ?? "0", 10);
      const lostJobs = parseInt(lostRes[0]?.count ?? "0", 10);
      const closeRate = totalJobs > 0 ? (wonJobs / totalJobs) * 100 : 0;

      const segmentBreakdown: Record<string, number> = {};
      for (const seg of VALID_SEGMENTS) {
        const segFilter = buildJobFilter(startUnix, endUnix, seg, rep.sales_rep_jnid, roofOnly);
        const [segTotal, segWon, segLost] = await Promise.all([
          query<{ count: string }>(`SELECT COUNT(*) AS count FROM jobs j WHERE ${segFilter.where}`, segFilter.params),
          query<{ count: string }>(`SELECT COUNT(*) AS count FROM jobs j WHERE ${segFilter.where} AND j.status_name = ANY($${segFilter.nextIdx}::text[])`, [...segFilter.params, WON_STATUSES]),
          query<{ count: string }>(`SELECT COUNT(*) AS count FROM jobs j WHERE ${segFilter.where} AND j.status_name = ANY($${segFilter.nextIdx}::text[])`, [...segFilter.params, LOSS_STATUSES]),
        ]);
        const st = parseInt(segTotal[0]?.count ?? "0", 10);
        const sw = parseInt(segWon[0]?.count ?? "0", 10);
        // Keep the lost query in the Promise batch so this is easy to expand later.
        void segLost;
        segmentBreakdown[seg] = st > 0 ? round1((sw / st) * 100) : 0;
      }

      return {
        repId: rep.sales_rep_jnid,
        repName: rep.sales_rep_name,
        totalJobs,
        wonJobs,
        lostJobs,
        closeRate: round1(closeRate),
        segmentCloseRates: segmentBreakdown,
        revenue: round2(parseFloat(revenueRes[0]?.total ?? "0")),
        avgCycleDays: 0,
        statusConversions: [],
        followUpMetrics: { avgAfterEstimate: 0, avgAfterAppointment: 0, jobsWithZeroFollowUp: 0 },
        timeBetweenStatuses: [],
      };
    }));

    repMetrics.sort((a, b) => b.revenue - a.revenue);
    const totalJobs = repMetrics.reduce((s, r) => s + r.totalJobs, 0);
    const totalWon = repMetrics.reduce((s, r) => s + r.wonJobs, 0);
    const totalLost = repMetrics.reduce((s, r) => s + r.lostJobs, 0);
    const totalRevenue = round2(repMetrics.reduce((s, r) => s + r.revenue, 0));
    void totalLost;
    const avgCloseRate = totalJobs > 0 ? round1((totalWon / totalJobs) * 100) : 0;

    return NextResponse.json({
      period: { key: period, label: range.label, start: range.start.toISOString(), end: range.end.toISOString() },
      filters: { segment, rep: repJnid, roofOnly },
      summary: { totalRevenue, avgCloseRate, avgCycleTimeDays: 0, activeReps: repMetrics.length, totalJobs, totalWon },
      reps: repMetrics,
    });
  } catch (error) {
    console.error("Sales API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
