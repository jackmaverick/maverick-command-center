/**
 * Self-updating payment-lag model (U1).
 *
 * "How long does a job type take to get paid" is NOT a hand-maintained table —
 * it is computed from actuals (invoices + job_stage_history) over a trailing
 * window and recomputed on a schedule. Keyed by (segment x work-type) with a
 * sample-size-gated hierarchical fallback so thin slices don't produce noisy
 * medians.
 *
 * This module separates the PURE model (table build + fallback resolution,
 * fully unit-tested) from the SQL loader (thin, runs the measurement query).
 */

export type Segment =
  | "retail"
  | "insurance"
  | "repairs"
  | "real_estate"
  | "warranty"
  | "other";

/** Payment steps we measure. sold_to_paid is the full remaining lag. */
export type PaymentStep = "sold_to_invoice" | "invoice_to_paid" | "sold_to_paid";

/** Sentinel work-type used until the per-job work-type field is pinned (Open Q). */
export const WORKTYPE_ALL = "all";

/** A single measured median from actuals. */
export interface LagMeasurement {
  segment: Segment;
  workType: string;
  step: PaymentStep;
  medianDays: number;
  sampleCount: number;
}

export type LagConfidence = "high" | "medium" | "low" | "none";
export type LagLevel = "segment_worktype" | "segment" | "global" | "default";

export interface LagEntry {
  days: number;
  sampleCount: number;
  level: LagLevel;
  confidence: LagConfidence;
}

export interface LagModelOptions {
  /** Min samples for a bucket to be trusted before falling back. */
  sampleFloor?: number;
  /** Samples at/above which a specific bucket is "high" confidence. */
  highConfidence?: number;
  /** Hard fallback days per step when no data exists at any level. */
  defaults?: Partial<Record<PaymentStep, number>>;
}

const DEFAULTS: Required<Omit<LagModelOptions, "defaults">> & {
  defaults: Record<PaymentStep, number>;
} = {
  sampleFloor: 8,
  highConfidence: 20,
  // Sane industry-ish fallbacks (days) when a segment has no history at all.
  defaults: {
    sold_to_invoice: 7,
    invoice_to_paid: 14,
    sold_to_paid: 21,
  },
};

function key(segment: string, workType: string, step: PaymentStep): string {
  return `${segment}::${workType}::${step}`;
}

/** Build an indexed lookup from flat measurement rows. Pure. */
export function buildLagTable(
  measurements: LagMeasurement[]
): Map<string, LagMeasurement> {
  const table = new Map<string, LagMeasurement>();
  for (const m of measurements) {
    table.set(key(m.segment, m.workType, m.step), m);
  }
  return table;
}

/**
 * Resolve the lag for a (segment, workType, step), walking the fallback
 * hierarchy: segment x workType -> segment -> global, taking the most specific
 * bucket that clears the sample floor. If none clears it, return the most
 * specific bucket that exists at all (confidence "low"); if nothing exists,
 * return the hard default (confidence "none"). Pure.
 */
export function resolveLag(
  table: Map<string, LagMeasurement>,
  segment: Segment,
  workType: string,
  step: PaymentStep,
  options: LagModelOptions = {}
): LagEntry {
  const sampleFloor = options.sampleFloor ?? DEFAULTS.sampleFloor;
  const highConfidence = options.highConfidence ?? DEFAULTS.highConfidence;
  const defaults = { ...DEFAULTS.defaults, ...(options.defaults ?? {}) };

  const candidates: { level: LagLevel; m: LagMeasurement | undefined }[] = [
    { level: "segment_worktype", m: table.get(key(segment, workType, step)) },
    { level: "segment", m: table.get(key(segment, WORKTYPE_ALL, step)) },
    { level: "global", m: table.get(key("other", WORKTYPE_ALL, step)) },
  ];

  // First, the most specific bucket that clears the sample floor.
  for (const c of candidates) {
    if (c.m && c.m.sampleCount >= sampleFloor) {
      const specific = c.level === "segment_worktype";
      return {
        days: c.m.medianDays,
        sampleCount: c.m.sampleCount,
        level: c.level,
        confidence:
          specific && c.m.sampleCount >= highConfidence ? "high" : "medium",
      };
    }
  }

  // Nothing cleared the floor — use the most specific bucket that exists.
  for (const c of candidates) {
    if (c.m) {
      return {
        days: c.m.medianDays,
        sampleCount: c.m.sampleCount,
        level: c.level,
        confidence: "low",
      };
    }
  }

  // No data at any level — hard default.
  return {
    days: defaults[step],
    sampleCount: 0,
    level: "default",
    confidence: "none",
  };
}

// ── SQL loader (thin) ────────────────────────────────────────────────────────

type QueryFn = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) => Promise<T[]>;

interface RawLagRow {
  segment: Segment;
  step: PaymentStep;
  median_days: string | null;
  sample_count: string;
}

/**
 * Load measured medians from actuals over a trailing window.
 *
 * v1 measures invoice_to_paid directly from the invoices table
 * (date_invoice -> date_paid_in_full), which is clean and the most important
 * lag for "when does AR land". sold_to_invoice / sold_to_paid and the
 * work-type dimension are follow-ups (return at segment level, workType=all).
 */
export async function loadLagMeasurements(
  query: QueryFn,
  segmentSql: string,
  trailingDays = 180
): Promise<LagMeasurement[]> {
  const rows = await query<RawLagRow>(
    `
    WITH paid AS (
      SELECT
        (${segmentSql}) AS segment,
        'invoice_to_paid'::text AS step,
        GREATEST(
          0,
          (i.date_paid_in_full - COALESCE(i.date_invoice, i.jn_date_created))::numeric / 86400.0
        ) AS days
      FROM invoices i
      JOIN jobs j ON j.jnid = i.job_jnid
      WHERE i.date_paid_in_full IS NOT NULL
        AND i.date_paid_in_full > 0
        AND COALESCE(i.date_invoice, i.jn_date_created) > 0
        AND to_timestamp(i.date_paid_in_full) >= now() - ($1 || ' days')::interval
    )
    SELECT segment, step,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY days) AS median_days,
           count(*)::text AS sample_count
    FROM paid
    GROUP BY segment, step
    `,
    [trailingDays]
  );

  return rows
    .filter((r) => r.median_days !== null)
    .map((r) => ({
      segment: r.segment,
      workType: WORKTYPE_ALL,
      step: r.step,
      medianDays: Math.round(parseFloat(r.median_days as string) * 10) / 10,
      sampleCount: parseInt(r.sample_count, 10),
    }));
}
