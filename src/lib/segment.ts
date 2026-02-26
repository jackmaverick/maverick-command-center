import type { Segment } from "./constants";

/**
 * Classify a job into a segment based on Supabase columns.
 * Real Estate is a cross-cutting segment detected by cf_string_29 = '🔑'.
 * Otherwise falls back to record_type_name.
 */
export function classifySegment(
  cfString29: string | null,
  recordTypeName: string | null
): Segment {
  if (cfString29 === "🔑") return "real_estate";
  if (recordTypeName === "Insurance") return "insurance";
  if (recordTypeName === "Repairs") return "repairs";
  return "retail";
}

/**
 * SQL CASE expression for computing segment inline in queries.
 * Use this in SELECT/WHERE clauses against the jobs table.
 * Real Estate is detected by the key emoji in cf_string_29.
 */
export const SEGMENT_SQL = `
  CASE
    WHEN j.cf_string_29 = '🔑' THEN 'real_estate'
    WHEN j.record_type_name = 'Insurance' THEN 'insurance'
    WHEN j.record_type_name = 'Repairs' THEN 'repairs'
    ELSE 'retail'
  END
`;

/**
 * SQL WHERE clause fragment to filter by segment.
 * Pass the segment value as a query parameter.
 */
export function segmentWhereClause(paramIndex: number): string {
  return `(${SEGMENT_SQL}) = $${paramIndex}`;
}
