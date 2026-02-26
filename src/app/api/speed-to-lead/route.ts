import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import type { Segment } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PERIODS: PeriodKey[] = [
  "week",
  "last_week",
  "month",
  "last_month",
  "quarter",
  "ytd",
  "all",
];

const VALID_SEGMENTS: Segment[] = [
  "real_estate",
  "retail",
  "insurance",
  "repairs",
];

/** Response time buckets in minutes. Each entry is [label, maxMinutes]. */
const RESPONSE_BUCKETS: [string, number][] = [
  ["<1 min", 1],
  ["1-5 min", 5],
  ["5-15 min", 15],
  ["15-30 min", 30],
  ["30-60 min", 60],
  ["1-4 hr", 240],
  ["4-24 hr", 1440],
];
const LAST_BUCKET_LABEL = "24+ hr";

/** 24 hours in minutes -- threshold for "missed" (no response). */
const MISSED_THRESHOLD_MIN = 1440;

/** Pipeline velocity stage transitions to measure. */
const VELOCITY_TRANSITIONS: [string, string][] = [
  ["Lead", "Appointment Scheduled"],
  ["Appointment Scheduled", "Estimate Sent"],
  ["Estimate Sent", "Signed Contract"],
  ["Signed Contract", "Job Scheduled"],
  ["Job Scheduled", "Paid & Closed"],
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResponseTimeRow {
  contact_jnid: string;
  inbound_at: string;
  first_outbound_at: string | null;
  response_minutes: string | null;
  openphone_user_id: string | null;
}

interface RepResponseRow {
  openphone_user_id: string;
  rep_name: string;
  avg_minutes: string;
  under_5_count: string;
  missed_count: string;
  total_inbound: string;
}

interface VelocityRow {
  from_stage: string;
  to_stage: string;
  avg_days: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Place a response time (in minutes) into the correct distribution bucket.
 * Returns the bucket label string.
 */
function getBucketLabel(minutes: number): string {
  for (const [label, max] of RESPONSE_BUCKETS) {
    if (minutes < max) return label;
  }
  return LAST_BUCKET_LABEL;
}

/**
 * Build a segment filter fragment for the jobs table (alias `j`).
 * Returns the SQL AND clause (with leading AND) or empty string.
 */
function buildSegmentClause(
  segment: Segment | null,
  params: unknown[]
): string {
  if (!segment) return "";
  params.push(segment);
  return ` AND (${SEGMENT_SQL}) = $${params.length}`;
}

// ---------------------------------------------------------------------------
// GET /api/speed-to-lead
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // -- Parse & validate period --
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = VALID_PERIODS.includes(periodParam) ? periodParam : "month";
    const range = getDateRange(period);

    // -- Parse & validate segment --
    const segmentParam = searchParams.get("segment") as Segment | null;
    const segment =
      segmentParam && VALID_SEGMENTS.includes(segmentParam)
        ? segmentParam
        : null;

    // Timestamps for TIMESTAMPTZ comparisons
    const startISO = range.start.toISOString();
    const endISO = range.end.toISOString();

    // Run all independent queries in parallel
    const [responseTimeRows, repResponseRows, velocityRows] =
      await Promise.all([
        queryResponseTimes(startISO, endISO, segment),
        queryRepResponseTimes(startISO, endISO, segment),
        queryPipelineVelocity(startISO, endISO, segment),
      ]);

    // -- 1. Aggregate response times --
    const responseTimes: number[] = [];
    let missedCount = 0;
    let totalInbound = responseTimeRows.length;

    for (const row of responseTimeRows) {
      if (row.response_minutes !== null) {
        const mins = parseFloat(row.response_minutes);
        if (mins <= MISSED_THRESHOLD_MIN) {
          responseTimes.push(mins);
        } else {
          missedCount++;
        }
      } else {
        // No outbound response found at all
        missedCount++;
      }
    }

    const avgResponseMinutes =
      responseTimes.length > 0
        ? round2(
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          )
        : 0;

    const respondedUnder5Min =
      totalInbound > 0
        ? round1(
            (responseTimes.filter((m) => m < 5).length / totalInbound) * 100
          )
        : 0;

    const missedPercent =
      totalInbound > 0 ? round1((missedCount / totalInbound) * 100) : 0;

    // -- 2. Response time distribution --
    const bucketCounts: Record<string, number> = {};
    for (const [label] of RESPONSE_BUCKETS) {
      bucketCounts[label] = 0;
    }
    bucketCounts[LAST_BUCKET_LABEL] = 0;

    // Include ALL inbound: responded ones get bucketed by time, missed go to 24+ hr
    for (const row of responseTimeRows) {
      if (row.response_minutes !== null) {
        const mins = parseFloat(row.response_minutes);
        const label = getBucketLabel(mins);
        bucketCounts[label] = (bucketCounts[label] ?? 0) + 1;
      } else {
        bucketCounts[LAST_BUCKET_LABEL]++;
      }
    }

    const responseDistribution = [
      ...RESPONSE_BUCKETS.map(([label]) => ({
        bucket: label,
        count: bucketCounts[label],
        percent: totalInbound > 0 ? round1((bucketCounts[label] / totalInbound) * 100) : 0,
      })),
      {
        bucket: LAST_BUCKET_LABEL,
        count: bucketCounts[LAST_BUCKET_LABEL],
        percent:
          totalInbound > 0
            ? round1((bucketCounts[LAST_BUCKET_LABEL] / totalInbound) * 100)
            : 0,
      },
    ];

    // -- 3. Per-rep response times --
    const repResponseTimes = repResponseRows.map((row) => {
      const total = parseInt(row.total_inbound, 10);
      const under5 = parseInt(row.under_5_count, 10);
      const missed = parseInt(row.missed_count, 10);
      return {
        repId: row.openphone_user_id,
        repName: row.rep_name,
        avgMinutes: round2(parseFloat(row.avg_minutes)),
        under5MinPercent: total > 0 ? round1((under5 / total) * 100) : 0,
        missedPercent: total > 0 ? round1((missed / total) * 100) : 0,
        totalInbound: total,
      };
    });

    // -- 4. Pipeline velocity --
    const pipelineVelocity = velocityRows.map((row) => ({
      from: row.from_stage,
      to: row.to_stage,
      avgDays: round1(parseFloat(row.avg_days)),
    }));

    const totalCycleDays = round1(
      pipelineVelocity.reduce((sum, v) => sum + v.avgDays, 0)
    );

    // -- Assemble response --
    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      filters: {
        segment: segment ?? "all",
      },
      summary: {
        totalInbound,
        avgResponseMinutes,
        respondedUnder5MinPercent: respondedUnder5Min,
        missedPercent,
        totalCycleDays,
      },
      responseDistribution,
      repResponseTimes,
      pipelineVelocity,
    });
  } catch (error) {
    console.error("[Speed-to-Lead API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch speed-to-lead metrics" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Query: Response times (inbound → first outbound per contact)
// ---------------------------------------------------------------------------
//
// Strategy:
// 1. Gather all inbound touches (calls + SMS) in the period that have a
//    contact_jnid, optionally filtered to jobs in a specific segment.
// 2. For each inbound touch, find the FIRST outbound touch (call or SMS) to
//    the same contact_jnid that occurred AFTER the inbound timestamp.
// 3. The response time = first_outbound_at - inbound_at.
// ---------------------------------------------------------------------------

async function queryResponseTimes(
  startISO: string,
  endISO: string,
  segment: Segment | null
): Promise<ResponseTimeRow[]> {
  const params: unknown[] = [startISO, endISO];
  const segmentClause = segment
    ? (() => {
        params.push(segment);
        return ` AND (${SEGMENT_SQL}) = $${params.length}`;
      })()
    : "";

  // We need the segment join/clause for the outbound subquery as well,
  // but the outbound just needs to match the same contact_jnid -- no segment
  // filter on the outbound side (we want ANY response to that contact).

  const sql = `
    WITH inbound_touches AS (
      -- Inbound calls with a contact link
      SELECT
        c.contact_jnid,
        c.job_jnid,
        c.started_at AS inbound_at,
        c.openphone_user_id
      FROM calls c
      ${segment ? "JOIN jobs j ON j.jnid = c.job_jnid" : ""}
      WHERE c.direction = 'inbound'
        AND c.contact_jnid IS NOT NULL
        AND c.started_at >= $1
        AND c.started_at < $2
        ${segmentClause}

      UNION ALL

      -- Inbound SMS with a contact link
      SELECT
        s.contact_jnid,
        s.job_jnid,
        s.sent_at AS inbound_at,
        s.openphone_user_id
      FROM sms_messages s
      ${segment ? "JOIN jobs j ON j.jnid = s.job_jnid" : ""}
      WHERE s.direction = 'incoming'
        AND s.contact_jnid IS NOT NULL
        AND s.sent_at >= $1
        AND s.sent_at < $2
        ${segmentClause}
    ),
    -- Deduplicate: keep only the FIRST inbound per contact in the period
    first_inbound AS (
      SELECT DISTINCT ON (contact_jnid)
        contact_jnid,
        job_jnid,
        inbound_at,
        openphone_user_id
      FROM inbound_touches
      ORDER BY contact_jnid, inbound_at ASC
    ),
    -- Find the first outbound response to each contact after their inbound
    first_outbound AS (
      SELECT
        fi.contact_jnid,
        MIN(outbound_at) AS first_outbound_at
      FROM first_inbound fi
      CROSS JOIN LATERAL (
        -- Outbound calls to this contact
        SELECT c2.started_at AS outbound_at
        FROM calls c2
        WHERE c2.contact_jnid = fi.contact_jnid
          AND c2.direction = 'outbound'
          AND c2.started_at > fi.inbound_at

        UNION ALL

        -- Outgoing SMS to this contact
        SELECT s2.sent_at AS outbound_at
        FROM sms_messages s2
        WHERE s2.contact_jnid = fi.contact_jnid
          AND s2.direction = 'outgoing'
          AND s2.sent_at > fi.inbound_at
      ) outbound
      GROUP BY fi.contact_jnid
    )
    SELECT
      fi.contact_jnid,
      fi.inbound_at::text,
      fo.first_outbound_at::text,
      EXTRACT(EPOCH FROM (fo.first_outbound_at - fi.inbound_at)) / 60.0 AS response_minutes,
      fi.openphone_user_id
    FROM first_inbound fi
    LEFT JOIN first_outbound fo ON fo.contact_jnid = fi.contact_jnid
  `;

  return query<ResponseTimeRow>(sql, params);
}

// ---------------------------------------------------------------------------
// Query: Per-rep response times
// ---------------------------------------------------------------------------
//
// For each OpenPhone user, calculate their average response time to inbound
// contacts. The rep is identified by who made the FIRST outbound response.
// ---------------------------------------------------------------------------

async function queryRepResponseTimes(
  startISO: string,
  endISO: string,
  segment: Segment | null
): Promise<RepResponseRow[]> {
  const params: unknown[] = [startISO, endISO];
  const segmentClause = segment
    ? (() => {
        params.push(segment);
        return ` AND (${SEGMENT_SQL}) = $${params.length}`;
      })()
    : "";

  const sql = `
    WITH inbound_touches AS (
      SELECT
        c.contact_jnid,
        c.job_jnid,
        c.started_at AS inbound_at
      FROM calls c
      ${segment ? "JOIN jobs j ON j.jnid = c.job_jnid" : ""}
      WHERE c.direction = 'inbound'
        AND c.contact_jnid IS NOT NULL
        AND c.started_at >= $1
        AND c.started_at < $2
        ${segmentClause}

      UNION ALL

      SELECT
        s.contact_jnid,
        s.job_jnid,
        s.sent_at AS inbound_at
      FROM sms_messages s
      ${segment ? "JOIN jobs j ON j.jnid = s.job_jnid" : ""}
      WHERE s.direction = 'incoming'
        AND s.contact_jnid IS NOT NULL
        AND s.sent_at >= $1
        AND s.sent_at < $2
        ${segmentClause}
    ),
    first_inbound AS (
      SELECT DISTINCT ON (contact_jnid)
        contact_jnid,
        inbound_at
      FROM inbound_touches
      ORDER BY contact_jnid, inbound_at ASC
    ),
    -- Find the first outbound response WITH the responding user
    first_response AS (
      SELECT DISTINCT ON (fi.contact_jnid)
        fi.contact_jnid,
        fi.inbound_at,
        resp.outbound_at,
        resp.responding_user_id,
        EXTRACT(EPOCH FROM (resp.outbound_at - fi.inbound_at)) / 60.0 AS response_minutes
      FROM first_inbound fi
      CROSS JOIN LATERAL (
        SELECT c2.started_at AS outbound_at, c2.openphone_user_id AS responding_user_id
        FROM calls c2
        WHERE c2.contact_jnid = fi.contact_jnid
          AND c2.direction = 'outbound'
          AND c2.started_at > fi.inbound_at

        UNION ALL

        SELECT s2.sent_at AS outbound_at, s2.openphone_user_id AS responding_user_id
        FROM sms_messages s2
        WHERE s2.contact_jnid = fi.contact_jnid
          AND s2.direction = 'outgoing'
          AND s2.sent_at > fi.inbound_at
      ) resp
      ORDER BY fi.contact_jnid, resp.outbound_at ASC
    ),
    -- Count inbound per contact (for missed calculation, we need total)
    inbound_counts AS (
      SELECT
        fi.contact_jnid,
        fi.inbound_at
      FROM first_inbound fi
    ),
    -- Assign each inbound to the responding rep (or NULL if missed)
    rep_assignments AS (
      SELECT
        ic.contact_jnid,
        fr.responding_user_id,
        fr.response_minutes
      FROM inbound_counts ic
      LEFT JOIN first_response fr ON fr.contact_jnid = ic.contact_jnid
    )
    SELECT
      COALESCE(ra.responding_user_id, 'unassigned') AS openphone_user_id,
      COALESCE(ou.name, ju.name, 'Unknown') AS rep_name,
      COALESCE(AVG(ra.response_minutes) FILTER (WHERE ra.response_minutes IS NOT NULL AND ra.response_minutes <= ${MISSED_THRESHOLD_MIN}), 0)::text AS avg_minutes,
      COUNT(*) FILTER (WHERE ra.response_minutes IS NOT NULL AND ra.response_minutes < 5)::text AS under_5_count,
      COUNT(*) FILTER (WHERE ra.response_minutes IS NULL OR ra.response_minutes > ${MISSED_THRESHOLD_MIN})::text AS missed_count,
      COUNT(*)::text AS total_inbound
    FROM rep_assignments ra
    LEFT JOIN openphone_users ou ON ou.openphone_user_id = ra.responding_user_id
    LEFT JOIN jobnimbus_users ju ON ju.jnid = ou.jobnimbus_user_jnid
    WHERE ra.responding_user_id IS NOT NULL
    GROUP BY ra.responding_user_id, ou.name, ju.name
    ORDER BY COUNT(*) DESC
  `;

  return query<RepResponseRow>(sql, params);
}

// ---------------------------------------------------------------------------
// Query: Pipeline velocity (avg days between key status transitions)
// ---------------------------------------------------------------------------

async function queryPipelineVelocity(
  startISO: string,
  endISO: string,
  segment: Segment | null
): Promise<VelocityRow[]> {
  // Build VALUES list for the transition pairs
  const params: unknown[] = [startISO, endISO];
  const segmentClause = buildSegmentClause(segment, params);

  const pairStartIdx = params.length + 1;
  const pairValues = VELOCITY_TRANSITIONS.map(
    (_, i) =>
      `($${pairStartIdx + i * 2}::text, $${pairStartIdx + i * 2 + 1}::text)`
  ).join(", ");
  const pairParams = VELOCITY_TRANSITIONS.flatMap(([from, to]) => [from, to]);
  params.push(...pairParams);

  const sql = `
    WITH pairs(from_s, to_s) AS (
      VALUES ${pairValues}
    ),
    transitions AS (
      SELECT
        h_from.to_stage_name AS from_stage,
        h_to.to_stage_name AS to_stage,
        EXTRACT(EPOCH FROM (MIN(h_to.changed_at) - MAX(h_from.changed_at))) / 86400.0 AS days_diff
      FROM pairs p
      JOIN job_stage_history h_from
        ON h_from.to_stage_name = p.from_s
      JOIN job_stage_history h_to
        ON h_to.job_jnid = h_from.job_jnid
        AND h_to.to_stage_name = p.to_s
        AND h_to.changed_at > h_from.changed_at
      JOIN jobs j ON j.jnid = h_from.job_jnid
      WHERE h_from.changed_at >= $1
        AND h_from.changed_at < $2
        ${segmentClause}
      GROUP BY h_from.job_jnid, h_from.to_stage_name, h_to.to_stage_name
    )
    SELECT
      from_stage,
      to_stage,
      COALESCE(AVG(days_diff), 0)::text AS avg_days
    FROM transitions
    WHERE days_diff >= 0
    GROUP BY from_stage, to_stage
    ORDER BY
      CASE from_stage
        WHEN 'Lead' THEN 1
        WHEN 'Appointment Scheduled' THEN 2
        WHEN 'Estimate Sent' THEN 3
        WHEN 'Signed Contract' THEN 4
        WHEN 'Job Scheduled' THEN 5
        ELSE 6
      END
  `;

  return query<VelocityRow>(sql, params);
}
