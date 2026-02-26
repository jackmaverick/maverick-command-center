import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SEGMENT_SQL, segmentWhereClause } from "@/lib/segment";
import { getDateRange, toUnixSeconds, type PeriodKey } from "@/lib/dates";
import {
  STATUS_TO_STAGE,
  ORDERED_STATUSES,
  LOSS_STATUSES,
  STAGES,
  type Stage,
  type Segment,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageCount {
  stage: Stage;
  count: number;
}

interface StatusCount {
  status_name: string;
  count: number;
}

interface KeyConversion {
  from: string;
  to: string;
  rate: number;
  fromCount: number;
  toCount: number;
}

interface LossByStage {
  stage: string;
  count: number;
  rate: number;
}

interface PipelineValueByStage {
  stage: Stage;
  value: number;
}

interface SegmentComparison {
  segment: Segment;
  activeJobs: number;
  overallConversion: number;
  avgCycleTimeDays: number | null;
  pipelineValue: number;
  revenue: number;
  leadToEstimateRate: number;
  estimateToSoldRate: number;
  soldToInvoicedRate: number;
}

interface PipelineResponse {
  period: { key: PeriodKey; label: string; start: string; end: string };
  segment: Segment | null;
  stageCounts: StageCount[];
  statusCounts: StatusCount[];
  overallConversion: { rate: number; convertedJobs: number; totalJobs: number };
  keyConversions: KeyConversion[];
  lossByStage: LossByStage[];
  avgCycleTimeDays: number | null;
  pipelineValueByStage: PipelineValueByStage[];
  segmentComparison: SegmentComparison[];
  revenueInPeriod: number;
}

// ---------------------------------------------------------------------------
// Helpers
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

/** Index of a status in the ordered pipeline (higher = further along). */
const STATUS_INDEX = Object.fromEntries(
  ORDERED_STATUSES.map((s, i) => [s, i])
) as Record<string, number>;

/** The index of Signed Contract -- anything >= this is "converted". */
const SIGNED_CONTRACT_IDX = STATUS_INDEX["Signed Contract"];

/**
 * Build the optional segment WHERE fragment and push the param if needed.
 * Returns the SQL fragment (empty string if no segment filter).
 */
function buildSegmentFilter(
  segment: Segment | null,
  params: unknown[]
): string {
  if (!segment) return "";
  params.push(segment);
  return ` AND ${segmentWhereClause(params.length)}`;
}

// ---------------------------------------------------------------------------
// GET /api/pipeline
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // -- Parse & validate period --
    const periodParam = (searchParams.get("period") ?? "month") as PeriodKey;
    if (!VALID_PERIODS.includes(periodParam)) {
      return NextResponse.json(
        { error: `Invalid period. Must be one of: ${VALID_PERIODS.join(", ")}` },
        { status: 400 }
      );
    }
    const range = getDateRange(periodParam);
    const startUnix = toUnixSeconds(range.start);
    const endUnix = toUnixSeconds(range.end);

    // -- Parse & validate segment --
    const segmentParam = searchParams.get("segment") as Segment | null;
    if (segmentParam && !VALID_SEGMENTS.includes(segmentParam)) {
      return NextResponse.json(
        {
          error: `Invalid segment. Must be one of: ${VALID_SEGMENTS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Run all independent queries in parallel
    const [
      stageCounts,
      statusCounts,
      conversionData,
      keyConversions,
      lossByStage,
      avgCycleTime,
      pipelineValue,
      segmentComparison,
      revenueInPeriod,
    ] = await Promise.all([
      queryStageCounts(startUnix, endUnix, segmentParam),
      queryStatusCounts(startUnix, endUnix, segmentParam),
      queryOverallConversion(startUnix, endUnix, segmentParam),
      queryKeyConversions(startUnix, endUnix, segmentParam),
      queryLossByStage(startUnix, endUnix, segmentParam),
      queryAvgCycleTime(startUnix, endUnix, segmentParam),
      queryPipelineValueByStage(segmentParam),
      querySegmentComparison(startUnix, endUnix),
      queryRevenueInPeriod(startUnix, endUnix, segmentParam),
    ]);

    const response: PipelineResponse = {
      period: {
        key: periodParam,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      segment: segmentParam,
      stageCounts,
      statusCounts,
      overallConversion: conversionData,
      keyConversions,
      lossByStage,
      avgCycleTimeDays: avgCycleTime,
      pipelineValueByStage: pipelineValue,
      segmentComparison,
      revenueInPeriod,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[Pipeline API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Query: Stage counts (active pipeline snapshot)
// ---------------------------------------------------------------------------

async function queryStageCounts(
  startUnix: number,
  endUnix: number,
  segment: Segment | null
): Promise<StageCount[]> {
  const params: unknown[] = [startUnix, endUnix];
  const segFilter = buildSegmentFilter(segment, params);

  const rows = await query<{ status_name: string; cnt: string }>(
    `SELECT j.status_name, COUNT(*)::text AS cnt
     FROM jobs j
     WHERE j.is_active = true
       AND j.is_archived = false
       AND j.jn_date_created >= $1
       AND j.jn_date_created <= $2
       ${segFilter}
     GROUP BY j.status_name`,
    params
  );

  // Aggregate into stages
  const stageMap: Record<string, number> = {};
  for (const s of STAGES) stageMap[s] = 0;

  for (const row of rows) {
    const stage = STATUS_TO_STAGE[row.status_name];
    if (stage) {
      stageMap[stage] += parseInt(row.cnt, 10);
    }
  }

  return STAGES.map((stage) => ({
    stage,
    count: stageMap[stage] ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Query: Status counts (granular, every JN status)
// ---------------------------------------------------------------------------

async function queryStatusCounts(
  startUnix: number,
  endUnix: number,
  segment: Segment | null
): Promise<StatusCount[]> {
  const params: unknown[] = [startUnix, endUnix];
  const segFilter = buildSegmentFilter(segment, params);

  const rows = await query<{ status_name: string; cnt: string }>(
    `SELECT j.status_name, COUNT(*)::text AS cnt
     FROM jobs j
     WHERE j.is_active = true
       AND j.is_archived = false
       AND j.jn_date_created >= $1
       AND j.jn_date_created <= $2
       ${segFilter}
     GROUP BY j.status_name
     ORDER BY COUNT(*) DESC`,
    params
  );

  return rows.map((r) => ({
    status_name: r.status_name,
    count: parseInt(r.cnt, 10),
  }));
}

// ---------------------------------------------------------------------------
// Query: Overall conversion (reached Signed Contract or beyond / total)
// ---------------------------------------------------------------------------

async function queryOverallConversion(
  startUnix: number,
  endUnix: number,
  segment: Segment | null
): Promise<{ rate: number; convertedJobs: number; totalJobs: number }> {
  const params: unknown[] = [startUnix, endUnix];
  const segFilter = buildSegmentFilter(segment, params);

  // Total jobs created in period
  const totalRows = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM jobs j
     WHERE j.jn_date_created >= $1
       AND j.jn_date_created <= $2
       ${segFilter}`,
    params
  );
  const totalJobs = parseInt(totalRows[0]?.cnt ?? "0", 10);

  // Build the list of statuses at or beyond Signed Contract
  const convertedStatuses = ORDERED_STATUSES.filter(
    (s) => STATUS_INDEX[s] >= SIGNED_CONTRACT_IDX
  );

  // Jobs that either currently are at a converted status or have history of reaching one
  const convParams: unknown[] = [startUnix, endUnix];
  const segFilterConv = buildSegmentFilter(segment, convParams);
  const placeholders = convertedStatuses.map((_, i) => `$${convParams.length + i + 1}`);
  convParams.push(...convertedStatuses);

  const convRows = await query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT j.id)::text AS cnt
     FROM jobs j
     WHERE j.jn_date_created >= $1
       AND j.jn_date_created <= $2
       ${segFilterConv}
       AND (
         j.status_name IN (${placeholders.join(", ")})
         OR EXISTS (
           SELECT 1 FROM job_stage_history h
           WHERE h.job_id = j.id
             AND h.to_stage_name IN (${placeholders.join(", ")})
         )
       )`,
    convParams
  );
  const convertedJobs = parseInt(convRows[0]?.cnt ?? "0", 10);

  return {
    rate: totalJobs > 0 ? (convertedJobs / totalJobs) * 100 : 0,
    convertedJobs,
    totalJobs,
  };
}

// ---------------------------------------------------------------------------
// Query: Key conversions (Lead→Estimate Sent, Estimate Sent→Signed, Signed→Invoiced)
// ---------------------------------------------------------------------------

async function queryKeyConversions(
  startUnix: number,
  endUnix: number,
  segment: Segment | null
): Promise<KeyConversion[]> {
  const transitions: [string, string][] = [
    ["Lead", "Estimate Sent"],
    ["Estimate Sent", "Signed Contract"],
    ["Signed Contract", "Paid & Closed"],
  ];

  const results: KeyConversion[] = [];

  for (const [from, to] of transitions) {
    // "From" count: jobs that reached the "from" status (or beyond) in the period
    const fromStatuses = ORDERED_STATUSES.filter(
      (s) => STATUS_INDEX[s] >= STATUS_INDEX[from]
    );
    const toStatuses = ORDERED_STATUSES.filter(
      (s) => STATUS_INDEX[s] >= STATUS_INDEX[to]
    );

    const fromParams: unknown[] = [startUnix, endUnix];
    const segFilterFrom = buildSegmentFilter(segment, fromParams);
    const fromPlaceholders = fromStatuses.map(
      (_, i) => `$${fromParams.length + i + 1}`
    );
    fromParams.push(...fromStatuses);

    const fromRows = await query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT j.id)::text AS cnt
       FROM jobs j
       WHERE j.jn_date_created >= $1
         AND j.jn_date_created <= $2
         ${segFilterFrom}
         AND (
           j.status_name IN (${fromPlaceholders.join(", ")})
           OR EXISTS (
             SELECT 1 FROM job_stage_history h
             WHERE h.job_id = j.id
               AND h.to_stage_name IN (${fromPlaceholders.join(", ")})
           )
         )`,
      fromParams
    );
    const fromCount = parseInt(fromRows[0]?.cnt ?? "0", 10);

    const toParams: unknown[] = [startUnix, endUnix];
    const segFilterTo = buildSegmentFilter(segment, toParams);
    const toPlaceholders = toStatuses.map(
      (_, i) => `$${toParams.length + i + 1}`
    );
    toParams.push(...toStatuses);

    const toRows = await query<{ cnt: string }>(
      `SELECT COUNT(DISTINCT j.id)::text AS cnt
       FROM jobs j
       WHERE j.jn_date_created >= $1
         AND j.jn_date_created <= $2
         ${segFilterTo}
         AND (
           j.status_name IN (${toPlaceholders.join(", ")})
           OR EXISTS (
             SELECT 1 FROM job_stage_history h
             WHERE h.job_id = j.id
               AND h.to_stage_name IN (${toPlaceholders.join(", ")})
           )
         )`,
      toParams
    );
    const toCount = parseInt(toRows[0]?.cnt ?? "0", 10);

    results.push({
      from,
      to,
      rate: fromCount > 0 ? (toCount / fromCount) * 100 : 0,
      fromCount,
      toCount,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Query: Loss rate by stage (which stage did lost jobs fall out of?)
// ---------------------------------------------------------------------------

async function queryLossByStage(
  startUnix: number,
  endUnix: number,
  segment: Segment | null
): Promise<LossByStage[]> {
  const params: unknown[] = [startUnix, endUnix];
  const segFilter = buildSegmentFilter(segment, params);

  const lossStatusPlaceholders = LOSS_STATUSES.map(
    (_, i) => `$${params.length + i + 1}`
  );
  params.push(...LOSS_STATUSES);

  // For each lost job, find the last non-loss status from stage history
  const rows = await query<{ last_stage: string; cnt: string }>(
    `WITH lost_jobs AS (
       SELECT j.id, j.status_name
       FROM jobs j
       WHERE j.jn_date_created >= $1
         AND j.jn_date_created <= $2
         AND j.status_name IN (${lossStatusPlaceholders.join(", ")})
         ${segFilter}
     ),
     last_active_status AS (
       SELECT DISTINCT ON (lj.id)
         lj.id,
         h.from_stage_name AS last_status
       FROM lost_jobs lj
       JOIN job_stage_history h ON h.job_id = lj.id
       WHERE h.to_stage_name IN (${lossStatusPlaceholders.join(", ")})
       ORDER BY lj.id, h.changed_at DESC
     )
     SELECT
       COALESCE(las.last_status, 'Unknown') AS last_stage,
       COUNT(*)::text AS cnt
     FROM lost_jobs lj
     LEFT JOIN last_active_status las ON las.id = lj.id
     GROUP BY COALESCE(las.last_status, 'Unknown')
     ORDER BY COUNT(*) DESC`,
    params
  );

  // Total lost for rate calculation
  const totalLost = rows.reduce((sum, r) => sum + parseInt(r.cnt, 10), 0);

  return rows.map((r) => {
    const count = parseInt(r.cnt, 10);
    // Map the raw status to a stage name for cleaner output
    const stage = STATUS_TO_STAGE[r.last_stage] ?? r.last_stage;
    return {
      stage,
      count,
      rate: totalLost > 0 ? (count / totalLost) * 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Query: Avg cycle time (job creation → Paid & Closed)
// ---------------------------------------------------------------------------

async function queryAvgCycleTime(
  startUnix: number,
  endUnix: number,
  segment: Segment | null
): Promise<number | null> {
  const params: unknown[] = [startUnix, endUnix];
  const segFilter = buildSegmentFilter(segment, params);

  const rows = await query<{ avg_days: string | null }>(
    `SELECT
       AVG(
         EXTRACT(EPOCH FROM h.changed_at) / 86400.0
         - j.jn_date_created / 86400.0
       )::text AS avg_days
     FROM jobs j
     JOIN job_stage_history h ON h.job_id = j.id
     WHERE j.jn_date_created >= $1
       AND j.jn_date_created <= $2
       AND h.to_stage_name = 'Paid & Closed'
       ${segFilter}`,
    params
  );

  const val = rows[0]?.avg_days;
  return val ? parseFloat(parseFloat(val).toFixed(1)) : null;
}

// ---------------------------------------------------------------------------
// Query: Pipeline value by stage (current active pipeline snapshot)
// ---------------------------------------------------------------------------

async function queryPipelineValueByStage(
  segment: Segment | null
): Promise<PipelineValueByStage[]> {
  const params: unknown[] = [];
  const segFilter = segment
    ? (() => {
        params.push(segment);
        return ` AND ${segmentWhereClause(params.length)}`;
      })()
    : "";

  const rows = await query<{ status_name: string; total_value: string }>(
    `SELECT j.status_name, COALESCE(SUM(j.approved_estimate_total), 0)::text AS total_value
     FROM jobs j
     WHERE j.is_active = true
       AND j.is_archived = false
       ${segFilter}
     GROUP BY j.status_name`,
    params
  );

  // Aggregate by stage
  const stageMap: Record<string, number> = {};
  for (const s of STAGES) stageMap[s] = 0;

  for (const row of rows) {
    const stage = STATUS_TO_STAGE[row.status_name];
    if (stage) {
      stageMap[stage] += parseFloat(row.total_value);
    }
  }

  return STAGES.map((stage) => ({
    stage,
    value: parseFloat((stageMap[stage] ?? 0).toFixed(2)),
  }));
}

// ---------------------------------------------------------------------------
// Query: Segment comparison (all 4 segments side by side)
// ---------------------------------------------------------------------------

async function querySegmentComparison(
  startUnix: number,
  endUnix: number
): Promise<SegmentComparison[]> {
  // Active job counts + pipeline value by segment
  const activeRows = await query<{
    segment: Segment;
    active_count: string;
    pipeline_value: string;
  }>(
    `SELECT
       (${SEGMENT_SQL}) AS segment,
       COUNT(*)::text AS active_count,
       COALESCE(SUM(j.approved_estimate_total), 0)::text AS pipeline_value
     FROM jobs j
     WHERE j.is_active = true AND j.is_archived = false
     GROUP BY (${SEGMENT_SQL})`,
    []
  );

  // Total jobs per segment in period
  const totalRows = await query<{ segment: Segment; cnt: string }>(
    `SELECT (${SEGMENT_SQL}) AS segment, COUNT(*)::text AS cnt
     FROM jobs j
     WHERE j.jn_date_created >= $1 AND j.jn_date_created <= $2
     GROUP BY (${SEGMENT_SQL})`,
    [startUnix, endUnix]
  );

  // Build the converted statuses list
  const convertedStatuses = ORDERED_STATUSES.filter(
    (s) => STATUS_INDEX[s] >= SIGNED_CONTRACT_IDX
  );
  const convPlaceholders = convertedStatuses.map((_, i) => `$${i + 3}`);

  // Converted jobs per segment in period
  const convRows = await query<{ segment: Segment; cnt: string }>(
    `SELECT (${SEGMENT_SQL}) AS segment, COUNT(DISTINCT j.id)::text AS cnt
     FROM jobs j
     WHERE j.jn_date_created >= $1
       AND j.jn_date_created <= $2
       AND (
         j.status_name IN (${convPlaceholders.join(", ")})
         OR EXISTS (
           SELECT 1 FROM job_stage_history h
           WHERE h.job_id = j.id
             AND h.to_stage_name IN (${convPlaceholders.join(", ")})
         )
       )
     GROUP BY (${SEGMENT_SQL})`,
    [startUnix, endUnix, ...convertedStatuses]
  );

  // Avg cycle time per segment
  const cycleRows = await query<{
    segment: Segment;
    avg_days: string | null;
  }>(
    `SELECT
       (${SEGMENT_SQL}) AS segment,
       AVG(
         EXTRACT(EPOCH FROM h.changed_at) / 86400.0
         - j.jn_date_created / 86400.0
       )::text AS avg_days
     FROM jobs j
     JOIN job_stage_history h ON h.job_id = j.id
     WHERE j.jn_date_created >= $1
       AND j.jn_date_created <= $2
       AND h.to_stage_name = 'Paid & Closed'
     GROUP BY (${SEGMENT_SQL})`,
    [startUnix, endUnix]
  );

  // Revenue per segment in period
  const revenueRows = await query<{ segment: Segment; total: string }>(
    `SELECT
       (${SEGMENT_SQL}) AS segment,
       COALESCE(SUM(inv.total), 0)::text AS total
     FROM invoices inv
     JOIN jobs j ON j.jnid = inv.job_jnid
     WHERE inv.is_active = true
       AND inv.date_invoice >= $1
       AND inv.date_invoice <= $2
     GROUP BY (${SEGMENT_SQL})`,
    [startUnix, endUnix]
  );

  // Key conversions per segment (Lead→Estimate Sent, Estimate Sent→Signed, Signed→Invoiced)
  const keyConvTransitions: [string, string][] = [
    ["Lead", "Estimate Sent"],
    ["Estimate Sent", "Signed Contract"],
    ["Signed Contract", "Paid & Closed"],
  ];

  // For each transition, query counts grouped by segment
  const segKeyConvs: Record<
    Segment,
    { leadToEstimate: number; estimateToSold: number; soldToInvoiced: number }
  > = {
    real_estate: { leadToEstimate: 0, estimateToSold: 0, soldToInvoiced: 0 },
    retail: { leadToEstimate: 0, estimateToSold: 0, soldToInvoiced: 0 },
    insurance: { leadToEstimate: 0, estimateToSold: 0, soldToInvoiced: 0 },
    repairs: { leadToEstimate: 0, estimateToSold: 0, soldToInvoiced: 0 },
  };

  for (let ti = 0; ti < keyConvTransitions.length; ti++) {
    const [from, to] = keyConvTransitions[ti];
    const fromStatuses = ORDERED_STATUSES.filter(
      (s) => STATUS_INDEX[s] >= STATUS_INDEX[from]
    );
    const toStatuses = ORDERED_STATUSES.filter(
      (s) => STATUS_INDEX[s] >= STATUS_INDEX[to]
    );

    const fromParams: unknown[] = [startUnix, endUnix];
    const fromPH = fromStatuses.map((_, i) => `$${fromParams.length + i + 1}`);
    fromParams.push(...fromStatuses);

    const fromBySegment = await query<{ segment: Segment; cnt: string }>(
      `SELECT (${SEGMENT_SQL}) AS segment, COUNT(DISTINCT j.id)::text AS cnt
       FROM jobs j
       WHERE j.jn_date_created >= $1 AND j.jn_date_created <= $2
         AND (
           j.status_name IN (${fromPH.join(", ")})
           OR EXISTS (
             SELECT 1 FROM job_stage_history h
             WHERE h.job_id = j.id AND h.to_stage_name IN (${fromPH.join(", ")})
           )
         )
       GROUP BY (${SEGMENT_SQL})`,
      fromParams
    );

    const toParams: unknown[] = [startUnix, endUnix];
    const toPH = toStatuses.map((_, i) => `$${toParams.length + i + 1}`);
    toParams.push(...toStatuses);

    const toBySegment = await query<{ segment: Segment; cnt: string }>(
      `SELECT (${SEGMENT_SQL}) AS segment, COUNT(DISTINCT j.id)::text AS cnt
       FROM jobs j
       WHERE j.jn_date_created >= $1 AND j.jn_date_created <= $2
         AND (
           j.status_name IN (${toPH.join(", ")})
           OR EXISTS (
             SELECT 1 FROM job_stage_history h
             WHERE h.job_id = j.id AND h.to_stage_name IN (${toPH.join(", ")})
           )
         )
       GROUP BY (${SEGMENT_SQL})`,
      toParams
    );

    // Build lookup maps
    const fromMap = Object.fromEntries(
      fromBySegment.map((r) => [r.segment, parseInt(r.cnt, 10)])
    ) as Record<Segment, number>;
    const toMap = Object.fromEntries(
      toBySegment.map((r) => [r.segment, parseInt(r.cnt, 10)])
    ) as Record<Segment, number>;

    for (const seg of VALID_SEGMENTS) {
      const fc = fromMap[seg] ?? 0;
      const tc = toMap[seg] ?? 0;
      const rate = fc > 0 ? (tc / fc) * 100 : 0;

      if (ti === 0) segKeyConvs[seg].leadToEstimate = rate;
      else if (ti === 1) segKeyConvs[seg].estimateToSold = rate;
      else segKeyConvs[seg].soldToInvoiced = rate;
    }
  }

  // Assemble per-segment results
  const activeMap = Object.fromEntries(
    activeRows.map((r) => [r.segment, r])
  ) as Record<Segment, (typeof activeRows)[0]>;
  const totalMap = Object.fromEntries(
    totalRows.map((r) => [r.segment, parseInt(r.cnt, 10)])
  ) as Record<Segment, number>;
  const convMap = Object.fromEntries(
    convRows.map((r) => [r.segment, parseInt(r.cnt, 10)])
  ) as Record<Segment, number>;
  const cycleMap = Object.fromEntries(
    cycleRows.map((r) => [r.segment, r.avg_days])
  ) as Record<Segment, string | null>;
  const revenueMap = Object.fromEntries(
    revenueRows.map((r) => [r.segment, parseFloat(r.total)])
  ) as Record<Segment, number>;

  return VALID_SEGMENTS.map((seg) => {
    const total = totalMap[seg] ?? 0;
    const converted = convMap[seg] ?? 0;

    return {
      segment: seg,
      activeJobs: parseInt(activeMap[seg]?.active_count ?? "0", 10),
      overallConversion: total > 0 ? (converted / total) * 100 : 0,
      avgCycleTimeDays: cycleMap[seg]
        ? parseFloat(parseFloat(cycleMap[seg]!).toFixed(1))
        : null,
      pipelineValue: parseFloat(
        (parseFloat(activeMap[seg]?.pipeline_value ?? "0")).toFixed(2)
      ),
      revenue: revenueMap[seg] ?? 0,
      leadToEstimateRate: segKeyConvs[seg].leadToEstimate,
      estimateToSoldRate: segKeyConvs[seg].estimateToSold,
      soldToInvoicedRate: segKeyConvs[seg].soldToInvoiced,
    };
  });
}

// ---------------------------------------------------------------------------
// Query: Revenue in period (from invoices table)
// ---------------------------------------------------------------------------

async function queryRevenueInPeriod(
  startUnix: number,
  endUnix: number,
  segment: Segment | null
): Promise<number> {
  if (segment) {
    // Need to join to jobs for segment classification
    const rows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(inv.total), 0)::text AS total
       FROM invoices inv
       JOIN jobs j ON j.jnid = inv.job_jnid
       WHERE inv.is_active = true
         AND inv.date_invoice >= $1
         AND inv.date_invoice <= $2
         AND ${segmentWhereClause(3)}`,
      [startUnix, endUnix, segment]
    );
    return parseFloat(rows[0]?.total ?? "0");
  }

  const rows = await query<{ total: string }>(
    `SELECT COALESCE(SUM(inv.total), 0)::text AS total
     FROM invoices inv
     WHERE inv.is_active = true
       AND inv.date_invoice >= $1
       AND inv.date_invoice <= $2`,
    [startUnix, endUnix]
  );
  return parseFloat(rows[0]?.total ?? "0");
}
