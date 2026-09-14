import { z } from "zod";

const text = z.string().max(2000);
const count = z.number().int().nonnegative();
const value = z.number().finite().nullable();
const date = z.iso.date().nullable();
const job = z.object({ id: text, number: text, lead_source: text }).strict();
const metrics = z
  .object({
    invoice_total: value,
    known_cost: value,
    gross_profit: value,
    margin_percent: value,
    profit_state: z.enum(["reconciled", "provisional", "unavailable"]),
    cost_status: text.nullable(),
    blockers: z.array(text),
    roof_squares: value,
    invoice_per_roof_square: value,
    gp_per_roof_square: value,
    home_value: value,
    home_value_basis: text.nullable(),
    home_value_observed_at: text.nullable(),
  })
  .strict();
const interval = z
  .object({
    n: count,
    exact_n: count,
    mean_days: value,
    median_days: value,
    min_days: value,
    max_days: value,
    confidence: text,
  })
  .strict();
export const neighborhoodSchema = z
  .object({
    version: z.literal(1),
    ronPrepCalendarDays: count,
    asOf: z.iso.datetime({ offset: true }),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    opportunities: z
      .array(
        z
          .object({
            id: text,
            neighborhood: text,
            action: text,
            map_action: text,
            priority_score: count,
            score_reasons: z.record(text, count),
            eligible_count: count.nullable(),
            historical_count: count.nullable(),
            gaps: z.array(text),
            earliest_repeat: date,
            previous_delivery: z
              .object({
                requested: z.iso.date(),
                vendor_planned_postal: date,
                postal_confirmed: date,
                seed_arrived: date,
              })
              .strict()
              .nullable(),
            copy_lane: text,
            jobs: z.array(job),
            roofs: z.array(
              z
                .object({
                  job_id: text,
                  status: text,
                  install_date: z.iso.date(),
                })
                .strict(),
            ),
            financials: z.array(metrics.extend({ job_id: text })),
            timing: z
              .object({
                request_date: z.iso.date(),
                postal_date: z.iso.date(),
                postal_basis: text,
                arrival_earliest: date,
                arrival_latest: date,
                arrival_basis: text,
                sample_n: count,
                sign_placement_due: z.iso.date(),
                sign_deadline_basis: text,
                needs_vendor_confirmation: z.boolean(),
              })
              .strict(),
            signs: z
              .object({
                planned_count: count,
                verified_count: count,
                can_claim_signs: z.boolean(),
                placement_due: z.iso.date(),
                retain_through: date,
                action: text,
              })
              .strict(),
            economics: z
              .object({
                example_count: count,
                median_known_job_profit: value,
                estimated_mail_cost: value,
                break_even_jobs_at_example_profit: value,
                basis: text,
                review: text,
              })
              .strict(),
          })
          .strict(),
      )
      .max(5000),
    delivery: z
      .object({
        request_to_seed: interval,
        request_to_postal: interval,
        postal_to_seed: interval,
      })
      .strict(),
    profitExamples: z.array(
      z
        .object({
          job,
          metrics,
          comparisonCount: count,
          bothSignalsCount: count,
          missingHomeValue: z.boolean(),
          missingRoofSquares: z.boolean(),
        })
        .strict(),
    ),
    graph: z
      .object({
        nodeCount: count,
        edgeCount: count,
        relations: z.record(text, count),
      })
      .strict(),
    changes: z.array(
      z.object({ id: text, action: text, reason: text }).strict(),
    ),
  })
  .strict();
export type NeighborhoodReview = z.infer<typeof neighborhoodSchema>;
export function neighborhoodIsStale(asOf: string, now = Date.now()) {
  const age = now - Date.parse(asOf);
  return !Number.isFinite(age) || age < 0 || age > 24 * 3600000;
}
