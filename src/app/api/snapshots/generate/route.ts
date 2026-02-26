import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { toUnixSeconds } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import { ORDERED_STATUSES, LOSS_STATUSES } from "@/lib/constants";
import type { Segment } from "@/lib/constants";
import type { WeeklySnapshot, SnapshotMetrics } from "@/types";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  format,
} from "date-fns";

// ── POST /api/snapshots/generate ────────────────────────────────────────────
// Computes metrics for the most recent completed period and upserts a snapshot.
//
// Query params:
//   ?type=weekly|monthly  (default: "weekly")
//
// Auth:
//   x-cron-secret header must match CRON_SECRET env var (if set).
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TYPES = ["weekly", "monthly"] as const;
type SnapshotType = (typeof VALID_TYPES)[number];

const ALL_SEGMENTS: Segment[] = ["real_estate", "retail", "insurance", "repairs"];

/** Statuses at or past "Signed Contract" count as won. */
const WON_STATUSES = (() => {
  const idx = ORDERED_STATUSES.indexOf("Signed Contract");
  return [...ORDERED_STATUSES.slice(idx)];
})();

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the start/end dates for the most recent completed period.
 */
function getPeriodBounds(type: SnapshotType): { start: Date; end: Date } {
  const now = new Date();

  if (type === "weekly") {
    // Most recent completed week (Mon-Sun).
    // If today is Monday, "last week" is the one that just ended yesterday (Sun).
    const lastWeek = subWeeks(now, 1);
    return {
      start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
      end: endOfWeek(lastWeek, { weekStartsOn: 1 }),
    };
  }

  // Monthly: most recent completed month.
  const lastMonth = subMonths(now, 1);
  return {
    start: startOfMonth(lastMonth),
    end: endOfMonth(lastMonth),
  };
}

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const provided = request.headers.get("x-cron-secret");
      if (provided !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // ── Parse params ──────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type") ?? "weekly";
    const snapshotType: SnapshotType = VALID_TYPES.includes(
      typeParam as SnapshotType
    )
      ? (typeParam as SnapshotType)
      : "weekly";

    const { start, end } = getPeriodBounds(snapshotType);
    const startUnix = toUnixSeconds(start);
    const endUnix = toUnixSeconds(end);
    const startDate = format(start, "yyyy-MM-dd");
    const endDate = format(end, "yyyy-MM-dd");

    // ── Run all metric queries in parallel ────────────────────────────

    const [
      revenueRows,
      newLeadsRows,
      jobsWonRows,
      jobsLostRows,
      avgTicketRows,
      pipelineRows,
      segmentRows,
      segmentRevenueRows,
      repCoreRows,
      repRevenueRows,
      leadSourceRows,
      leadSourceRevenueRows,
      responseTimeRows,
      repResponseRows,
    ] = await Promise.all([
      // 1. Revenue (accrual basis — invoices.date_invoice BIGINT unix seconds)
      query<{ total: string }>(
        `SELECT COALESCE(SUM(i.total), 0)::text AS total
         FROM invoices i
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice <= $2`,
        [startUnix, endUnix]
      ),

      // 2. New leads (jobs created in period)
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created <= $2`,
        [startUnix, endUnix]
      ),

      // 3. Jobs won (reached won status during period)
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created <= $2
           AND j.status_name = ANY($3::text[])`,
        [startUnix, endUnix, WON_STATUSES]
      ),

      // 4. Jobs lost
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created <= $2
           AND j.status_name = ANY($3::text[])`,
        [startUnix, endUnix, [...LOSS_STATUSES]]
      ),

      // 5. Avg ticket (from invoices in period)
      query<{ avg_ticket: string }>(
        `SELECT COALESCE(AVG(i.total), 0)::text AS avg_ticket
         FROM invoices i
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice <= $2
           AND i.total > 0`,
        [startUnix, endUnix]
      ),

      // 6. Pipeline value (active non-closed jobs)
      query<{ total: string }>(
        `SELECT COALESCE(SUM(j.approved_estimate_total), 0)::text AS total
         FROM jobs j
         WHERE j.is_active = true
           AND j.is_closed = false
           AND j.is_archived = false
           AND j.status_name IN (
             'Estimating', 'Estimate Sent', 'Signed Contract',
             'Pre-Production', 'Ready for Install',
             'Waiting on Adjuster', 'Supplementing'
           )`,
        []
      ),

      // 7. Segment breakdown: leads, won, lost per segment
      // $1=start, $2=end, $3=WON, $4=LOSS
      query<{
        segment: string;
        leads: string;
        won: string;
        lost: string;
      }>(
        `SELECT
           (${SEGMENT_SQL}) AS segment,
           COUNT(*)::text AS leads,
           COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]))::text AS won,
           COUNT(*) FILTER (WHERE j.status_name = ANY($4::text[]))::text AS lost
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created <= $2
         GROUP BY (${SEGMENT_SQL})`,
        [startUnix, endUnix, WON_STATUSES, [...LOSS_STATUSES]]
      ),

      // 7b. Segment revenue (via invoices joined to jobs)
      query<{ segment: string; revenue: string }>(
        `SELECT
           (${SEGMENT_SQL}) AS segment,
           COALESCE(SUM(i.total), 0)::text AS revenue
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice <= $2
         GROUP BY (${SEGMENT_SQL})`,
        [startUnix, endUnix]
      ),

      // 8. Rep core metrics: leads, won per rep
      // $1=start, $2=end, $3=WON
      query<{
        sales_rep_jnid: string;
        sales_rep_name: string;
        leads: string;
        won: string;
      }>(
        `SELECT
           j.sales_rep_jnid,
           COALESCE(j.sales_rep_name, u.name, 'Unknown') AS sales_rep_name,
           COUNT(*)::text AS leads,
           COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]))::text AS won
         FROM jobs j
         LEFT JOIN jobnimbus_users u ON u.jnid = j.sales_rep_jnid
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created <= $2
           AND j.sales_rep_jnid IS NOT NULL
         GROUP BY j.sales_rep_jnid, j.sales_rep_name, u.name`,
        [startUnix, endUnix, WON_STATUSES]
      ),

      // 9. Revenue per rep (accrual basis)
      query<{ sales_rep_jnid: string; revenue: string }>(
        `SELECT
           jj.sales_rep_jnid,
           COALESCE(SUM(i.total), 0)::text AS revenue
         FROM invoices i
         JOIN jobs jj ON jj.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice <= $2
           AND jj.sales_rep_jnid IS NOT NULL
         GROUP BY jj.sales_rep_jnid`,
        [startUnix, endUnix]
      ),

      // 10. Lead sources: leads, won per source
      // $1=start, $2=end, $3=WON
      query<{
        source_name: string;
        leads: string;
        won: string;
      }>(
        `SELECT
           COALESCE(j.source_name, 'Unknown') AS source_name,
           COUNT(*)::text AS leads,
           COUNT(*) FILTER (WHERE j.status_name = ANY($3::text[]))::text AS won
         FROM jobs j
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created <= $2
         GROUP BY COALESCE(j.source_name, 'Unknown')
         ORDER BY COUNT(*) DESC`,
        [startUnix, endUnix, WON_STATUSES]
      ),

      // 10b. Lead source revenue (via invoices joined to jobs)
      query<{ source_name: string; revenue: string }>(
        `SELECT
           COALESCE(j.source_name, 'Unknown') AS source_name,
           COALESCE(SUM(i.total), 0)::text AS revenue
         FROM invoices i
         JOIN jobs j ON j.jnid = i.job_jnid
         WHERE i.is_active = true
           AND i.date_invoice >= $1
           AND i.date_invoice <= $2
         GROUP BY COALESCE(j.source_name, 'Unknown')`,
        [startUnix, endUnix]
      ),

      // 11. Avg response time — first inbound call/SMS to first outbound response per contact
      //     Uses calls + sms_messages tables joined through openphone_users → jobnimbus_users
      query<{ avg_response_min: string | null }>(
        `WITH inbound AS (
           -- First inbound call per contact in period
           SELECT
             c.contact_jnid,
             MIN(c.started_at) AS first_inbound
           FROM calls c
           WHERE c.direction = 'inbound'
             AND c.started_at >= $1::timestamptz
             AND c.started_at <= $2::timestamptz
             AND c.contact_jnid IS NOT NULL
           GROUP BY c.contact_jnid

           UNION ALL

           -- First inbound SMS per contact in period
           SELECT
             s.contact_jnid,
             MIN(s.sent_at) AS first_inbound
           FROM sms_messages s
           WHERE s.direction = 'inbound'
             AND s.sent_at >= $1::timestamptz
             AND s.sent_at <= $2::timestamptz
             AND s.contact_jnid IS NOT NULL
           GROUP BY s.contact_jnid
         ),
         first_inbound_per_contact AS (
           SELECT contact_jnid, MIN(first_inbound) AS first_inbound
           FROM inbound
           GROUP BY contact_jnid
         ),
         outbound AS (
           -- First outbound call per contact after their first inbound
           SELECT
             c.contact_jnid,
             MIN(c.started_at) AS first_outbound
           FROM calls c
           JOIN first_inbound_per_contact fi ON fi.contact_jnid = c.contact_jnid
           WHERE c.direction = 'outbound'
             AND c.started_at > fi.first_inbound
           GROUP BY c.contact_jnid

           UNION ALL

           -- First outbound SMS per contact after their first inbound
           SELECT
             s.contact_jnid,
             MIN(s.sent_at) AS first_outbound
           FROM sms_messages s
           JOIN first_inbound_per_contact fi ON fi.contact_jnid = s.contact_jnid
           WHERE s.direction = 'outbound'
             AND s.sent_at > fi.first_inbound
           GROUP BY s.contact_jnid
         ),
         first_outbound_per_contact AS (
           SELECT contact_jnid, MIN(first_outbound) AS first_outbound
           FROM outbound
           GROUP BY contact_jnid
         ),
         response_times AS (
           SELECT
             EXTRACT(EPOCH FROM (fo.first_outbound - fi.first_inbound)) / 60.0 AS response_min
           FROM first_inbound_per_contact fi
           JOIN first_outbound_per_contact fo ON fo.contact_jnid = fi.contact_jnid
           WHERE fo.first_outbound > fi.first_inbound
         )
         SELECT AVG(response_min)::text AS avg_response_min
         FROM response_times
         WHERE response_min > 0 AND response_min < 1440`,
        [start.toISOString(), end.toISOString()]
      ),

      // 12. Per-rep avg response time
      //     Maps openphone_user_id → jobnimbus_user_jnid via openphone_users table
      query<{
        rep_jnid: string;
        avg_response_min: string | null;
      }>(
        `WITH inbound AS (
           SELECT
             c.contact_jnid,
             MIN(c.started_at) AS first_inbound
           FROM calls c
           WHERE c.direction = 'inbound'
             AND c.started_at >= $1::timestamptz
             AND c.started_at <= $2::timestamptz
             AND c.contact_jnid IS NOT NULL
           GROUP BY c.contact_jnid

           UNION ALL

           SELECT
             s.contact_jnid,
             MIN(s.sent_at) AS first_inbound
           FROM sms_messages s
           WHERE s.direction = 'inbound'
             AND s.sent_at >= $1::timestamptz
             AND s.sent_at <= $2::timestamptz
             AND s.contact_jnid IS NOT NULL
           GROUP BY s.contact_jnid
         ),
         first_inbound_per_contact AS (
           SELECT contact_jnid, MIN(first_inbound) AS first_inbound
           FROM inbound
           GROUP BY contact_jnid
         ),
         outbound_calls AS (
           SELECT
             c.contact_jnid,
             ou.jobnimbus_user_jnid AS rep_jnid,
             c.started_at AS outbound_at
           FROM calls c
           JOIN first_inbound_per_contact fi ON fi.contact_jnid = c.contact_jnid
           JOIN openphone_users ou ON ou.openphone_user_id = c.openphone_user_id
           WHERE c.direction = 'outbound'
             AND c.started_at > fi.first_inbound
         ),
         outbound_sms AS (
           SELECT
             s.contact_jnid,
             ou.jobnimbus_user_jnid AS rep_jnid,
             s.sent_at AS outbound_at
           FROM sms_messages s
           JOIN first_inbound_per_contact fi ON fi.contact_jnid = s.contact_jnid
           JOIN openphone_users ou ON ou.openphone_user_id = s.openphone_user_id
           WHERE s.direction = 'outbound'
             AND s.sent_at > fi.first_inbound
         ),
         all_outbound AS (
           SELECT * FROM outbound_calls
           UNION ALL
           SELECT * FROM outbound_sms
         ),
         first_outbound_per_contact AS (
           SELECT DISTINCT ON (contact_jnid)
             contact_jnid,
             rep_jnid,
             outbound_at
           FROM all_outbound
           ORDER BY contact_jnid, outbound_at ASC
         ),
         response_times AS (
           SELECT
             fo.rep_jnid,
             EXTRACT(EPOCH FROM (fo.outbound_at - fi.first_inbound)) / 60.0 AS response_min
           FROM first_inbound_per_contact fi
           JOIN first_outbound_per_contact fo ON fo.contact_jnid = fi.contact_jnid
           WHERE fo.outbound_at > fi.first_inbound
         )
         SELECT
           rep_jnid,
           AVG(response_min)::text AS avg_response_min
         FROM response_times
         WHERE response_min > 0 AND response_min < 1440
         GROUP BY rep_jnid`,
        [start.toISOString(), end.toISOString()]
      ),
    ]);

    // ── Process results ─────────────────────────────────────────────────

    const revenue = round2(parseFloat(revenueRows[0]?.total ?? "0"));
    const newLeads = parseInt(newLeadsRows[0]?.count ?? "0", 10);
    const jobsWon = parseInt(jobsWonRows[0]?.count ?? "0", 10);
    const jobsLost = parseInt(jobsLostRows[0]?.count ?? "0", 10);
    const decidedJobs = jobsWon + jobsLost;
    const closeRate = decidedJobs > 0 ? round1((jobsWon / decidedJobs) * 100) : 0;
    const avgTicket = round2(parseFloat(avgTicketRows[0]?.avg_ticket ?? "0"));
    const pipelineValue = round2(parseFloat(pipelineRows[0]?.total ?? "0"));

    const avgResponseRaw = responseTimeRows[0]?.avg_response_min;
    const avgResponseTimeMinutes = avgResponseRaw
      ? round1(parseFloat(avgResponseRaw))
      : null;

    // ── Segments ────────────────────────────────────────────────────────

    // Build segment revenue lookup from separate query
    const segRevenueMap: Record<string, number> = {};
    for (const row of segmentRevenueRows) {
      segRevenueMap[row.segment] = round2(parseFloat(row.revenue));
    }

    const segments: SnapshotMetrics["segments"] = {
      real_estate: { leads: 0, won: 0, lost: 0, closeRate: 0, revenue: 0 },
      retail: { leads: 0, won: 0, lost: 0, closeRate: 0, revenue: 0 },
      insurance: { leads: 0, won: 0, lost: 0, closeRate: 0, revenue: 0 },
      repairs: { leads: 0, won: 0, lost: 0, closeRate: 0, revenue: 0 },
    };

    for (const row of segmentRows) {
      const seg = row.segment as Segment;
      if (!ALL_SEGMENTS.includes(seg)) continue;

      const leads = parseInt(row.leads, 10);
      const won = parseInt(row.won, 10);
      const lost = parseInt(row.lost, 10);
      const decided = won + lost;

      segments[seg] = {
        leads,
        won,
        lost,
        closeRate: decided > 0 ? round1((won / decided) * 100) : 0,
        revenue: segRevenueMap[seg] ?? 0,
      };
    }

    // ── Reps ────────────────────────────────────────────────────────────

    // Build revenue lookup
    const revenueByRep: Record<string, number> = {};
    for (const row of repRevenueRows) {
      revenueByRep[row.sales_rep_jnid] = round2(parseFloat(row.revenue));
    }

    // Build response time lookup
    const responseByRep: Record<string, number | null> = {};
    for (const row of repResponseRows) {
      responseByRep[row.rep_jnid] = row.avg_response_min
        ? round1(parseFloat(row.avg_response_min))
        : null;
    }

    const reps: SnapshotMetrics["reps"] = {};
    for (const row of repCoreRows) {
      const leads = parseInt(row.leads, 10);
      const won = parseInt(row.won, 10);
      const repRevenue = revenueByRep[row.sales_rep_jnid] ?? 0;
      const repResponse = responseByRep[row.sales_rep_jnid] ?? null;

      reps[row.sales_rep_jnid] = {
        name: row.sales_rep_name,
        leads,
        won,
        closeRate: leads > 0 ? round1((won / leads) * 100) : 0,
        revenue: repRevenue,
        avgResponseMin: repResponse,
      };
    }

    // ── Lead sources ────────────────────────────────────────────────────

    // Build lead source revenue lookup from separate query
    const sourceRevenueMap: Record<string, number> = {};
    for (const row of leadSourceRevenueRows) {
      sourceRevenueMap[row.source_name] = round2(parseFloat(row.revenue));
    }

    const leadSources: SnapshotMetrics["leadSources"] = {};
    for (const row of leadSourceRows) {
      leadSources[row.source_name] = {
        leads: parseInt(row.leads, 10),
        won: parseInt(row.won, 10),
        revenue: sourceRevenueMap[row.source_name] ?? 0,
      };
    }

    // ── Assemble metrics JSONB ──────────────────────────────────────────

    const metrics: SnapshotMetrics = {
      period: {
        start: startDate,
        end: endDate,
        type: snapshotType,
      },
      revenue,
      newLeads,
      jobsWon,
      jobsLost,
      closeRate,
      avgTicket,
      pipelineValue,
      avgResponseTimeMinutes,
      segments,
      reps,
      leadSources,
      followUps: {
        avgAfterEstimate: 0,
        avgAfterAppointment: 0,
        jobsWithZeroFollowup: 0,
      },
    };

    // ── Compute follow-up metrics ───────────────────────────────────────

    const followUpRows = await query<{
      milestone: string;
      avg_followups: string;
      zero_count: string;
    }>(
      `WITH milestones AS (
         SELECT
           h.job_jnid,
           h.to_stage_name AS milestone,
           MIN(h.changed_at) AS milestone_date
         FROM job_stage_history h
         JOIN jobs j ON j.jnid = h.job_jnid
         WHERE j.jn_date_created >= $1
           AND j.jn_date_created <= $2
           AND h.to_stage_name IN ('Estimate Sent', 'Appointment Scheduled')
         GROUP BY h.job_jnid, h.to_stage_name
       ),
       followup_counts AS (
         SELECT
           m.milestone,
           m.job_jnid,
           COUNT(a.id) AS followup_count
         FROM milestones m
         LEFT JOIN activities a
           ON a.job_jnid = m.job_jnid
           AND a.activity_type_code IN ('note', 'call', 'email', 'text')
           AND a.activity_date > m.milestone_date
         GROUP BY m.milestone, m.job_jnid
       )
       SELECT
         milestone,
         COALESCE(AVG(followup_count), 0)::text AS avg_followups,
         COUNT(*) FILTER (WHERE followup_count = 0)::text AS zero_count
       FROM followup_counts
       GROUP BY milestone`,
      [startUnix, endUnix]
    );

    for (const row of followUpRows) {
      if (row.milestone === "Estimate Sent") {
        metrics.followUps.avgAfterEstimate = round1(
          parseFloat(row.avg_followups)
        );
        metrics.followUps.jobsWithZeroFollowup += parseInt(row.zero_count, 10);
      } else if (row.milestone === "Appointment Scheduled") {
        metrics.followUps.avgAfterAppointment = round1(
          parseFloat(row.avg_followups)
        );
        metrics.followUps.jobsWithZeroFollowup += parseInt(row.zero_count, 10);
      }
    }

    // ── Upsert snapshot ─────────────────────────────────────────────────

    const upsertedRow = await queryOne<WeeklySnapshot>(
      `INSERT INTO app_weekly_snapshots (week_start, week_end, snapshot_type, metrics)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (week_start, snapshot_type) DO UPDATE
         SET week_end = EXCLUDED.week_end,
             metrics = EXCLUDED.metrics,
             created_at = NOW()
       RETURNING id, week_start, week_end, snapshot_type, metrics, created_at`,
      [startDate, endDate, snapshotType, JSON.stringify(metrics)]
    );

    return NextResponse.json(upsertedRow);
  } catch (error) {
    console.error("[Snapshots Generate API] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate snapshot" },
      { status: 500 }
    );
  }
}
