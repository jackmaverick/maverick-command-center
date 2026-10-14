import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { PeriodKey } from "./dates";

export const REPORT_TIMEZONE = "America/Chicago";
export const META_ACCOUNT = "act_1782311009876417";
export function reportingWindow(period: PeriodKey, now = new Date()) {
  const today = formatInTimeZone(now, REPORT_TIMEZONE, "yyyy-MM-dd");
  const civil = new Date(`${today}T00:00:00Z`);
  let start = new Date(civil);
  let end = new Date(civil);
  const weekStart = (date: Date) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d; };
  if (period.startsWith("month:")) {
    start = new Date(`${period.slice(6)}-01T00:00:00Z`);
    end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  } else if (period.startsWith("week:")) {
    start = weekStart(new Date(`${period.slice(5)}T00:00:00Z`));
    end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  } else if (period === "all") start = new Date("2020-01-01T00:00:00Z");
  else if (period === "ytd") start.setUTCMonth(0, 1);
  else if (period === "quarter") start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3, 1);
  else if (period === "week" || period === "last_week") {
    start = weekStart(civil);
    if (period === "last_week") { end = new Date(start); start.setUTCDate(start.getUTCDate() - 7); }
  } else {
    start.setUTCDate(1);
    if (period === "last_month") { end = new Date(start); start.setUTCMonth(start.getUTCMonth() - 1); }
  }
  end = new Date(Math.min(end.getTime(), civil.getTime()));
  // Future selections are empty, never reversed ranges.
  if (start > end) start = new Date(end);
  const startDate = start.toISOString().slice(0,10), endDate = end.toISOString().slice(0,10);
  return { key: period, timezone: REPORT_TIMEZONE, startDate, endDate,
    start: fromZonedTime(`${startDate}T00:00:00`, REPORT_TIMEZONE).toISOString(),
    end: fromZonedTime(`${endDate}T00:00:00`, REPORT_TIMEZONE).toISOString(),
    note: "Exclusive end; complete Central calendar days only. Today is excluded." };
}

export function reportingChannel(source: string): string {
  const s = source.trim().toLowerCase();
  if (!s || s === "unknown") return "Unknown";
  if (["roof ignite - meta ads", "meta ads", "facebook ads", "meta"].includes(s)) return "Meta Ads";
  if (["direct mail", "direct_mail"].includes(s)) return "Direct Mail";
  if (["lsa", "local services ads", "google local services ads"].includes(s)) return "LSA";
  if (s.includes("google business profile")) return "Google Business Profile (organic)";
  if (["google ads", "google search ads"].includes(s)) return "Google Ads";
  if (s === "google search") return "Google Search (paid/organic unresolved)";
  return source.trim();
}

export interface CostEvidence {
  source: string; id: string; channel: string; kind: "media" | "mail" | "lead_charge" | "agency_payment" | "setup_payment";
  date: string; amount: number | null; platformLeads?: number | null;
  syncedAt: string | null; serviceStart?: string | null; serviceEnd?: string | null;
  reference?: string | null; currency?: string;
}
export interface ContactCohort {
  channel: string; jobRecords: number; contactGroups: number; existingContacts: number;
  missingContactJobs: number; approvedJobRecords: number; approvedContactGroups: number;
  datedSignedJobRecords?: number; datedSignedContactGroups?: number;
  latestSync: string | null; oldestSync: string | null;
}
export interface ReportInput {
  window: ReturnType<typeof reportingWindow>; costs: CostEvidence[]; cohorts: ContactCohort[];
  unavailableSources: string[]; budget: { recurringMonthly: number | null; oneTimePlanned: number | null };
  generatedAt?: string;
}
const money = (n: number) => Math.round(n * 100) / 100;
export function buildAcquisitionReport(input: ReportInput) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const names = new Set(["Meta Ads", "Direct Mail", "LSA", "Google Ads", "Unknown",
    ...input.costs.map(c => c.channel), ...input.cohorts.map(c => c.channel)]);
  const inWindow = (c: CostEvidence) => c.date >= input.window.startDate && c.date < input.window.endDate;
  const channels = [...names].sort().map(channel => {
    const all = input.costs.filter(c => c.channel === channel);
    const selected = all.filter(inWindow);
    const delivered = selected.filter(c => ["media","mail","lead_charge"].includes(c.kind));
    const numeric = delivered.filter(c => c.amount !== null && (!c.currency || c.currency === "USD"));
    const agency = selected.filter(c => c.kind === "agency_payment" && c.amount !== null && c.currency === "USD");
    const setup = selected.filter(c => c.kind === "setup_payment" && c.amount !== null && c.currency === "USD");
    const cohort = input.cohorts.filter(c => c.channel === channel);
    const sum = (field: keyof ContactCohort) => cohort.reduce((n,c) => n + Number(c[field] ?? 0), 0);
    const crmSyncs = cohort.map(c=>c.latestSync).filter((s): s is string=>!!s).sort();
    const crmOldest = cohort.map(c=>c.oldestSync).filter((s): s is string=>!!s).sort();
    const dates = [...new Set(delivered.map(c=>c.date))].sort();
    const globalDates = all.filter(c => ["media","mail","lead_charge"].includes(c.kind)).map(c=>c.date).sort();
    const costSubtotal = numeric.length ? money(numeric.reduce((n,c)=>n+c.amount!,0)) : null;
    const platformRows = delivered.filter(c=>c.kind==="media");
    const platformLeadsKnown = platformRows.length > 0 && platformRows.every(c=>c.platformLeads !== null && c.platformLeads !== undefined);
    const platformLeads = platformLeadsKnown ? platformRows.reduce((n,c)=>n+c.platformLeads!,0) : null;
    const platformCpl = platformLeads !== null && platformLeads > 0 && platformRows.every(c=>c.amount !== null)
      ? money(platformRows.reduce((n,c)=>n+c.amount!,0) / platformLeads) : null;
    const synced = all.filter(c => c.date < input.window.endDate && ["media","mail","lead_charge"].includes(c.kind)).map(c=>c.syncedAt).filter((s): s is string=>!!s).sort();
    return { channel, jobRecords: sum("jobRecords"), contactGroups: sum("contactGroups"), existingContacts: sum("existingContacts"),
      missingContactJobs: sum("missingContactJobs"), qualifiedLeads: null,
      approvedJobRecords: sum("approvedJobRecords"), approvedContactGroups: sum("approvedContactGroups"),
      datedSignedJobRecords:sum("datedSignedJobRecords"),datedSignedContactGroups:sum("datedSignedContactGroups"),
      firstTimeWonCustomers: null, crmCoverage: {latestSync:crmSyncs.at(-1)??null,oldestSync:crmOldest[0]??null,status:"raw_unqualified_contact_groups"}, recordedDeliveryCost: costSubtotal,
      agencyPayments: agency.length ? money(agency.reduce((n,c)=>n+c.amount!,0)) : null,
      setupPayments: setup.length ? money(setup.reduce((n,c)=>n+c.amount!,0)) : null,
      fullAcquisitionCost: null, crmCpl: null, customerCac: null,
      platformLeads, platformMediaCpl: platformCpl,
      coverage: { status: "partial_unverified", selectedRows: delivered.length, missingAmounts: delivered.filter(c=>c.amount===null).length,
        missingAmountsAllTime: all.filter(c=>c.amount===null).length,
        firstObservedDate: dates[0]??null, lastObservedDate: dates.at(-1)??null, observedDates: dates.length,
        ledgerFirstDate: globalDates[0]??null, ledgerLastDate: globalDates.at(-1)??null,
        latestSync: synced.at(-1)??null,
        stale: !synced.length || Date.parse(generatedAt)-Date.parse(synced.at(-1)!)>48*3600*1000 },
      evidence: selected, // Campaign/ledger IDs and aggregate amounts only; no homeowner data.
    };
  });
  channels.sort((a,b)=>(b.recordedDeliveryCost??-1)-(a.recordedDeliveryCost??-1)||b.jobRecords-a.jobRecords);
  return { period: input.window, generatedAt, channels, budget: input.budget,
    totals: { jobRecords: input.cohorts.reduce((n,c)=>n+c.jobRecords,0), contactGroups: input.cohorts.reduce((n,c)=>n+c.contactGroups,0),
      recordedDeliverySubtotal: channels.some(c=>c.recordedDeliveryCost!==null)
        ? money(channels.reduce((n,c)=>n+(c.recordedDeliveryCost??0),0)) : null,
      unallocatedCost:null,allChannelCpl: null, customerCac: null, qualifiedLeads: null },
    unavailableSources: input.unavailableSources,
    definitions: [
      "Actual costs exclude budget and accounting payment mirrors. Meta campaign rows with empty breakdown only; never add account/ad/adset or publisher rows.",
      "Recorded delivery subtotal is partial media/mail/lead-charge evidence, not complete acquisition cost. Missing amounts and dates are not zero spend.",
      "Agency payments use payment date; service dates remain in evidence. Setup is separate, not amortized. Management components are already inside service amounts; QBO representations are not added.",
      "CRM contact groups use primary_contact_jnid, assigned to the earliest job source within the selected cohort; missing contact jobs remain separate. Current attribution is provisional, not campaign matching.",
      "Nondeleted CRM job records include archived/lost jobs. Approval evidence is active Approved/signed estimates as observed now, not verified acquisition timing. First-time won customer CAC and qualification remain unverified.",
      "Platform CPL uses only observed campaign rows and platform action counts, not CRM contacts. Gaps are not assumed zero. Complete Central days only.",
    ] };
}
