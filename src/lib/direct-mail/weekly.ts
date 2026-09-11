import { z } from "zod";

const count = z.number().int().nonnegative();
const amount = z.number().finite().nonnegative();
const date = z.iso.date();
const month = z.string().regex(/^\d{4}-\d{2}$/);
const text = z.string().max(2000);
const evidenceUrl = z
  .string()
  .regex(/^https:\/\/mail\.google\.com\/mail\/#all\/[a-f0-9]+$/);
export const actionSchema = z
  .object({
    id: z.string().max(80),
    priority: count,
    neighborhood: text,
    lane: z.enum(["Resend", "Upcoming roof", "Resolve evidence", "New area"]),
    status: z.enum(["Prepare for review", "Verify timing", "Hold"]),
    due: date,
    install: date.nullable(),
    owner: text,
    reason: text,
    nextStep: text,
    gates: z.array(text).max(12),
    proposedQuantity: count.nullable(),
  })
  .strict();
export const weeklySchema = z
  .object({
    version: z.literal(1),
    asOf: date,
    generatedAt: z.iso.datetime({ offset: true }),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    jobLinks: z
      .array(
        z
          .object({
            jobId: z.string().regex(/^[a-zA-Z0-9_-]{10,80}$/),
            leadMonth: month,
            campaignId: text.nullable(),
            linkage: z.enum([
              "single_prior_list_address_match",
              "multiple_prior_lists_review",
              "no_exact_prior_list_match",
            ]),
          })
          .strict(),
      )
      .max(10000)
      .optional(),
    summary: z
      .object({
        leads: count,
        newLeads: count,
        archived: count,
        excludedTests: count,
        linkedLeads: count,
        requested: count,
        packages: count,
        uniqueAddresses: count,
        invoiced: amount,
        approvedSales: amount,
        balance: amount,
        knownPaid: amount,
        confirmedMailed: count.nullable(),
        collected: amount.nullable(),
        roas: amount.nullable(),
        profitRoi: z.number().finite().nullable(),
        budget: amount.nullable(),
      })
      .strict(),
    months: z.array(
      z
        .object({
          month,
          requested: count,
          leads: count,
          sales: amount,
          invoiced: amount,
          vendorCost: amount.nullable(),
          paid: amount.nullable(),
          roas: amount.nullable(),
          profitRoi: z.number().finite().nullable(),
        })
        .strict(),
    ),
    campaigns: z.array(
      z
        .object({
          id: text,
          name: text,
          requestedDate: date,
          plannedDate: date.nullable(),
          reviewDate: date,
          reviewBasis: text,
          requested: count,
          leads: count,
          invoiced: amount,
          laterTouches: count,
          confirmedMailed: count.nullable(),
          decision: text,
          evidence: evidenceUrl,
        })
        .strict(),
    ),
    roofs: z.array(
      z
        .object({
          date,
          neighborhood: text,
          status: text,
          scheduled: z.boolean(),
          priorLists: z.array(text),
          hail: z.array(z.object({ date, inches: amount }).strict()),
        })
        .strict(),
    ),
    profiles: z.array(
      z
        .object({
          neighborhood: text,
          properties: count,
          knownSizes: count,
          medianSize: amount.nullable(),
          knownYears: count,
          knownValues: count,
          knownOccupancy: count,
        })
        .strict(),
    ),
    invoices: z.array(
      z
        .object({
          number: text,
          serviceMonth: month,
          invoiceDate: date,
          paidDate: date.nullable(),
          amount,
          pieces: count,
          scope: text,
          invoiceEvidence: evidenceUrl,
          paymentEvidence: evidenceUrl.nullable(),
        })
        .strict(),
    ),
    actions: z.array(actionSchema).max(100),
    gaps: z.array(text).max(30),
  })
  .strict()
  .superRefine((data, ctx) => {
    const campaignIds = new Set(data.campaigns.map((c) => c.id));
    const jobIds = new Set<string>();
    for (const link of data.jobLinks ?? []) {
      if (
        jobIds.has(link.jobId) ||
        (link.campaignId !== null && !campaignIds.has(link.campaignId)) ||
        (link.linkage === "single_prior_list_address_match") !==
          (link.campaignId !== null)
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid or duplicate job linkage",
        });
      jobIds.add(link.jobId);
    }
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    for (const [label, total, actual] of [
      [
        "requested",
        data.summary.requested,
        sum(data.months.map((m) => m.requested)),
      ],
      ["leads", data.summary.leads, sum(data.months.map((m) => m.leads))],
      [
        "invoiced",
        data.summary.invoiced,
        sum(data.months.map((m) => m.invoiced)),
      ],
      [
        "campaign rows",
        data.summary.requested,
        sum(data.campaigns.map((c) => c.requested)),
      ],
      [
        "paid invoices",
        data.summary.knownPaid,
        sum(
          data.invoices
            .filter((i) => i.paidDate !== null && i.paymentEvidence !== null)
            .map((i) => i.amount),
        ),
      ],
    ] as const)
      if (Math.abs(total - actual) > 0.01)
        ctx.addIssue({
          code: "custom",
          message: `${label} does not reconcile`,
        });
    for (const values of [
      data.months.map((m) => m.month),
      data.campaigns.map((c) => c.id),
      data.invoices.map((i) => i.number),
      data.actions.map((a) => a.id),
    ])
      if (new Set(values).size !== values.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate record identifiers",
        });
  });
export type WeeklyReview = z.infer<typeof weeklySchema>;
export type WeeklyAction = z.infer<typeof actionSchema>;
export function reviewIsStale(asOf: string, now = new Date()): boolean {
  const chicagoDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Date.parse(chicagoDay) - Date.parse(asOf) > 7 * 86400000;
}
