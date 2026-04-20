import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { type PeriodKey, getDateRange } from "@/lib/dates";
import { SEGMENT_SQL } from "@/lib/segment";
import {
  type Segment,
  SPEED_TO_LEAD_BUCKETS,
  SPEED_TO_LEAD_EXCLUDED_STATUSES,
} from "@/lib/constants";

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
  "warranty",
];

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
const MISSED_THRESHOLD_MIN = 1440;

const VELOCITY_TRANSITIONS: [string, string][] = [
  ["Lead", "Appointment Scheduled"],
  ["Appointment Scheduled", "Estimating"],
  ["Estimating", "Estimate Sent"],
  ["Estimate Sent", "Sold Job"],
  ["Sold Job", "Invoiced"],
];

interface FirstInboundRow {
  contact_jnid: string;
  job_jnid: string | null;
  inbound_at: string;
  response_minutes: string | null;
  responding_user_id: string | null;
  job_status_name: string | null;
}

interface VelocityRow {
  from_stage: string;
  to_stage: string;
  avg_days: string;
}

interface UnknownCallsRow {
  touches: string;
  unique_numbers: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getBucketLabel(minutes: number): string {
  for (const [label, max] of RESPONSE_BUCKETS) {
    if (minutes < max) return label;
  }
  return LAST_BUCKET_LABEL;
}

function emptyDistribution() {
  return [
    ...RESPONSE_BUCKETS.map(([label]) => ({ bucket: label, count: 0, percent: 0 })),
    { bucket: LAST_BUCKET_LABEL, count: 0, percent: 0 },
  ];
}

function buildSegmentClause(segment: Segment | null, params: unknown[]): string {
  if (!segment) return "";
  params.push(segment);
  return ` AND (${SEGMENT_SQL}) = $${params.length}`;
}

const EXCLUDED_SET = new Set<string>(SPEED_TO_LEAD_EXCLUDED_STATUSES);

function statusToBucketKey(statusName: string | null): string | null {
  if (!statusName) return null;
  if (EXCLUDED_SET.has(statusName)) return "_excluded";
  for (const bucket of SPEED_TO_LEAD_BUCKETS) {
    if ((bucket.statuses as readonly string[]).includes(statusName)) {
      return bucket.key;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    const period = VALID_PERIODS.includes(periodParam) ? periodParam : "month";
    const range = getDateRange(period);

    const segmentParam = searchParams.get("segment") as Segment | null;
    const segment =
      segmentParam && VALID_SEGMENTS.includes(segmentParam) ? segmentParam : null;

    const startISO = range.start.toISOString();
    const endISO = range.end.toISOString();

    const [firstInboundRows, velocityRows, unknownCallsRow] = await Promise.all([
      queryFirstInboundWithStatus(startISO, endISO, segment),
      queryPipelineVelocity(startISO, endISO, segment),
      queryUnknownCalls(startISO, endISO),
    ]);

    // Aggregate per-bucket metrics
    const bucketState: Record<
      string,
      {
        responseTimes: number[];
        missedCount: number;
        hitSLACount: number;
        totalInbound: number;
        distribution: Record<string, number>;
      }
    > = {};
    for (const b of SPEED_TO_LEAD_BUCKETS) {
      bucketState[b.key] = {
        responseTimes: [],
        missedCount: 0,
        hitSLACount: 0,
        totalInbound: 0,
        distribution: {},
      };
    }

    let unlinkedContacts = 0;
    let excludedContacts = 0;
    const repTallies: Record<
      string,
      { name: string | null; total: number; under5: number; missed: number; sum: number; count: number }
    > = {};

    for (const row of firstInboundRows) {
      // Rep tally (kept independent of bucket filtering)
      const repKey = row.responding_user_id ?? "unassigned";
      if (!repTallies[repKey]) {
        repTallies[repKey] = { name: null, total: 0, under5: 0, missed: 0, sum: 0, count: 0 };
      }

      const mins =
        row.response_minutes !== null ? parseFloat(row.response_minutes) : null;

      const bucketKey = statusToBucketKey(row.job_status_name);

      if (!row.job_jnid || !row.job_status_name) {
        unlinkedContacts++;
      } else if (bucketKey === "_excluded" || bucketKey === null) {
        excludedContacts++;
      } else {
        const bucket = SPEED_TO_LEAD_BUCKETS.find((b) => b.key === bucketKey)!;
        const state = bucketState[bucketKey];
        state.totalInbound++;

        if (mins !== null && mins <= MISSED_THRESHOLD_MIN) {
          state.responseTimes.push(mins);
          const label = getBucketLabel(mins);
          state.distribution[label] = (state.distribution[label] ?? 0) + 1;
          if (mins <= bucket.slaMinutes) state.hitSLACount++;
        } else {
          state.missedCount++;
          state.distribution[LAST_BUCKET_LABEL] =
            (state.distribution[LAST_BUCKET_LABEL] ?? 0) + 1;
        }
      }

      // Rep stats (for any non-excluded contact with a responding rep)
      if (
        row.responding_user_id &&
        bucketKey !== "_excluded" &&
        bucketKey !== null
      ) {
        const t = repTallies[repKey];
        t.total++;
        if (mins !== null && mins <= MISSED_THRESHOLD_MIN) {
          t.sum += mins;
          t.count++;
          if (mins < 5) t.under5++;
        } else {
          t.missed++;
        }
      }
    }

    const buckets = SPEED_TO_LEAD_BUCKETS.map((b) => {
      const s = bucketState[b.key];
      const avg =
        s.responseTimes.length > 0
          ? round2(s.responseTimes.reduce((a, x) => a + x, 0) / s.responseTimes.length)
          : 0;
      const responseDistribution = emptyDistribution().map((d) => ({
        bucket: d.bucket,
        count: s.distribution[d.bucket] ?? 0,
        percent:
          s.totalInbound > 0
            ? round1(((s.distribution[d.bucket] ?? 0) / s.totalInbound) * 100)
            : 0,
      }));
      return {
        key: b.key,
        label: b.label,
        emoji: b.emoji,
        color: b.color,
        slaMinutes: b.slaMinutes,
        statuses: b.statuses,
        totalInbound: s.totalInbound,
        avgResponseMinutes: avg,
        hitSLACount: s.hitSLACount,
        hitSLAPercent:
          s.totalInbound > 0 ? round1((s.hitSLACount / s.totalInbound) * 100) : 0,
        missedCount: s.missedCount,
        missedPercent:
          s.totalInbound > 0 ? round1((s.missedCount / s.totalInbound) * 100) : 0,
        responseDistribution,
      };
    });

    // Resolve rep names (best-effort from firstInboundRows)
    const repNameLookup = await queryRepNames(Object.keys(repTallies));
    const repResponseTimes = Object.entries(repTallies)
      .filter(([, t]) => t.total > 0)
      .map(([repId, t]) => ({
        repId,
        repName: repNameLookup[repId] ?? "Unknown",
        avgMinutes: t.count > 0 ? round2(t.sum / t.count) : 0,
        under5MinPercent: t.total > 0 ? round1((t.under5 / t.total) * 100) : 0,
        missedPercent: t.total > 0 ? round1((t.missed / t.total) * 100) : 0,
        totalInbound: t.total,
      }))
      .sort((a, b) => b.totalInbound - a.totalInbound);

    const pipelineVelocity = velocityRows.map((row) => ({
      from: row.from_stage,
      to: row.to_stage,
      avgDays: round1(parseFloat(row.avg_days)),
    }));
    const totalCycleDays = round1(
      pipelineVelocity.reduce((sum, v) => sum + v.avgDays, 0)
    );

    const totalTrackedInbound = buckets.reduce((sum, b) => sum + b.totalInbound, 0);

    return NextResponse.json({
      period: {
        key: period,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      filters: { segment: segment ?? "all" },
      summary: {
        totalTrackedInbound,
        unlinkedContacts,
        excludedContacts,
        totalCycleDays,
      },
      unknownCalls: {
        touches: parseInt(unknownCallsRow.touches, 10),
        uniqueNumbers: parseInt(unknownCallsRow.unique_numbers, 10),
      },
      buckets,
      repResponseTimes,
      pipelineVelocity,
    });
  } catch (error) {
    console.error("[Speed-to-Lead API] Error:", error);
    const details = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { error: "Failed to fetch speed-to-lead metrics", details, stack },
      { status: 500 }
    );
  }
}

// One row per inbound contact in the period, with response time, responding
// rep, and the contact's linked job status.
async function queryFirstInboundWithStatus(
  startISO: string,
  endISO: string,
  segment: Segment | null
): Promise<FirstInboundRow[]> {
  const params: unknown[] = [startISO, endISO];
  const segmentClause = segment
    ? (() => {
        params.push(segment);
        return ` AND (${SEGMENT_SQL}) = $${params.length}`;
      })()
    : "";

  const sql = `
    WITH inbound_touches AS (
      SELECT c.contact_jnid, c.job_jnid, c.started_at AS inbound_at
      FROM calls c
      ${segment ? "JOIN jobs j ON j.jnid = c.job_jnid" : ""}
      WHERE c.direction = 'inbound'
        AND c.contact_jnid IS NOT NULL
        AND c.started_at >= $1
        AND c.started_at < $2
        ${segmentClause}

      UNION ALL

      SELECT s.contact_jnid, s.job_jnid, s.sent_at AS inbound_at
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
        contact_jnid, job_jnid, inbound_at
      FROM inbound_touches
      ORDER BY contact_jnid, inbound_at ASC
    ),
    first_response AS (
      SELECT DISTINCT ON (fi.contact_jnid)
        fi.contact_jnid,
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
    )
    SELECT
      fi.contact_jnid,
      fi.job_jnid,
      fi.inbound_at::text,
      fr.response_minutes::text,
      fr.responding_user_id,
      j.status_name AS job_status_name
    FROM first_inbound fi
    LEFT JOIN first_response fr ON fr.contact_jnid = fi.contact_jnid
    LEFT JOIN jobs j ON j.jnid = fi.job_jnid
  `;

  return query<FirstInboundRow>(sql, params);
}

async function queryRepNames(
  userIds: string[]
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const real = userIds.filter((id) => id !== "unassigned");
  if (real.length === 0) return {};

  const sql = `
    SELECT
      ou.openphone_user_id,
      COALESCE(ou.name, ju.name, 'Unknown') AS rep_name
    FROM openphone_users ou
    LEFT JOIN jobnimbus_users ju ON ju.jnid = ou.jobnimbus_user_jnid
    WHERE ou.openphone_user_id = ANY($1::text[])
  `;
  const rows = await query<{ openphone_user_id: string; rep_name: string }>(sql, [
    real,
  ]);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.openphone_user_id] = row.rep_name;
  return out;
}

async function queryUnknownCalls(
  startISO: string,
  endISO: string
): Promise<UnknownCallsRow> {
  const sql = `
    SELECT
      COUNT(*)::text AS touches,
      COUNT(DISTINCT from_number)::text AS unique_numbers
    FROM (
      SELECT from_number FROM calls
      WHERE direction = 'inbound'
        AND contact_jnid IS NULL
        AND started_at >= $1 AND started_at < $2
      UNION ALL
      SELECT from_number FROM sms_messages
      WHERE direction = 'incoming'
        AND contact_jnid IS NULL
        AND sent_at >= $1 AND sent_at < $2
    ) t
  `;
  const rows = await query<UnknownCallsRow>(sql, [startISO, endISO]);
  return rows[0] ?? { touches: "0", unique_numbers: "0" };
}

async function queryPipelineVelocity(
  startISO: string,
  endISO: string,
  segment: Segment | null
): Promise<VelocityRow[]> {
  const params: unknown[] = [startISO, endISO];
  const segmentClause = buildSegmentClause(segment, params);

  const pairStartIdx = params.length + 1;
  const pairValues = VELOCITY_TRANSITIONS.map(
    (_, i) => `($${pairStartIdx + i * 2}::text, $${pairStartIdx + i * 2 + 1}::text)`
  ).join(", ");
  const pairParams = VELOCITY_TRANSITIONS.flatMap(([from, to]) => [from, to]);
  params.push(...pairParams);

  const sql = `
    WITH pairs(from_s, to_s) AS (VALUES ${pairValues}),
    transitions AS (
      SELECT
        h_from.to_stage_name AS from_stage,
        h_to.to_stage_name AS to_stage,
        EXTRACT(EPOCH FROM (MIN(h_to.changed_at) - MAX(h_from.changed_at))) / 86400.0 AS days_diff
      FROM pairs p
      JOIN job_stage_history h_from ON h_from.to_stage_name = p.from_s
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
        WHEN 'Estimating' THEN 3
        WHEN 'Estimate Sent' THEN 4
        WHEN 'Sold Job' THEN 5
        ELSE 6
      END
  `;

  return query<VelocityRow>(sql, params);
}
