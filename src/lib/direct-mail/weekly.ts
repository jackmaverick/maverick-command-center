import { z } from "zod";
import { neighborhoodSchema } from "./neighborhoods";

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
    neighborhoodReview: neighborhoodSchema.optional(),
    asOf: date,
    generatedAt: z.iso.datetime({ offset: true }),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    costReview: z.object({
      reviewedAt: z.iso.datetime({ offset: true }),
      invoiceStamps: z.array(z.object({ number: text, amount }).strict()),
      allocations: z.array(z.object({
        campaignId: text,
        invoiceNumber: text.nullable(),
        vendorCost: amount.nullable(),
        method: z.enum(["exact", "allocated", "pending"]),
        postal: z.object({
          documentId: text, pieces: count.positive(), total: amount, net: amount,
          stamps: z.enum(["in_vendor", "outside_vendor", "unresolved"]),
          evidence: evidenceUrl,
        }).strict().nullable(),
        gaps: z.array(text).max(10),
        note: text,
      }).strict()).max(10000),
    }).strict().optional(),
    cashReview: z.object({
      verifiedAt: z.iso.datetime({ offset: true }),
      jobs: z.array(z.object({ jobId: text, applied: amount, unapplied: amount }).strict()).max(10000),
      months: z.array(z.object({ month, applied: amount, unapplied: amount }).strict()),
      note: text,
    }).strict().optional(),
    invoiceReview: z.object({
      verifiedAt: z.iso.datetime({ offset: true }),
      jobs: z.array(z.object({ jobId: text, invoiced: amount }).strict()).max(10000),
      note: text,
    }).strict().optional(),
    jobCostHolds: z.array(z.object({ jobId: text, reason: text }).strict()).max(1000).optional(),
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
          audienceStrategy: z
            .enum([
              "job_scheduled_neighborhood",
              "general_audience",
              "other",
              "unclassified",
            ])
            .optional(),
          touchType: z
            .enum(["first_touch", "resend", "mixed", "unclassified"])
            .optional(),
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
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (data.costReview) {
      const allocations = data.costReview.allocations;
      if (allocations.length !== campaignIds.size || new Set(allocations.map(a => a.campaignId)).size !== campaignIds.size)
        fail("Cost review must cover each campaign exactly once");
      const documents = new Set<string>();
      for (const a of allocations) {
        if (!campaignIds.has(a.campaignId)) fail("Unknown cost campaign");
        if (a.method === "pending" ? a.vendorCost !== null || a.invoiceNumber !== null : a.vendorCost === null || !data.invoices.some(i => i.number === a.invoiceNumber))
          fail("Invalid invoice allocation");
        if (a.postal) {
          if (documents.has(a.postal.documentId) || a.postal.net > a.postal.total) fail("Invalid or duplicate postal statement");
          documents.add(a.postal.documentId);
          if (a.postal.stamps === "in_vendor" && a.vendorCost === null) fail("Included stamps require a vendor invoice");
        }
      }
      for (const i of data.invoices)
        if (Math.abs(sum(allocations.filter(a => a.invoiceNumber === i.number).map(a => a.vendorCost ?? 0)) - i.amount) > 0.005)
          fail("List costs do not reconcile to invoice " + i.number);
      const stamps = data.costReview.invoiceStamps;
      if (stamps.length !== data.invoices.length || new Set(stamps.map(i => i.number)).size !== stamps.length) fail("Stamp review must cover every invoice once");
      for (const s of stamps) {
        const invoice = data.invoices.find(i => i.number === s.number);
        if (!invoice || s.amount > invoice.amount) fail("Invalid invoice stamp total");
      }
    }
    if (data.cashReview) {
      const cash = data.cashReview;
      if (cash.jobs.length !== jobIds.size || new Set(cash.jobs.map(j => j.jobId)).size !== jobIds.size || cash.jobs.some(j => !jobIds.has(j.jobId))) fail("Cash review must cover every reviewed job once");
      if (new Set(cash.months.map(m => m.month)).size !== cash.months.length) fail("Duplicate cash month");
      for (const field of ["applied", "unapplied"] as const)
        if (Math.abs(sum(cash.jobs.map(j => j[field])) - sum(cash.months.map(m => m[field]))) > 0.005) fail("Cash months do not reconcile to jobs");
    }
    if (data.invoiceReview) {
      const invoice = data.invoiceReview;
      if (invoice.jobs.length !== jobIds.size || new Set(invoice.jobs.map(j => j.jobId)).size !== jobIds.size || invoice.jobs.some(j => !jobIds.has(j.jobId)))
        fail("Invoice review must cover every reviewed job once");
      if (Math.abs(sum(invoice.jobs.map(j => j.invoiced)) - data.summary.invoiced) > 0.005)
        fail("Invoice review does not reconcile to invoiced revenue");
    }
    for (const h of data.jobCostHolds ?? []) if (!jobIds.has(h.jobId)) fail("Unknown job cost hold");
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
