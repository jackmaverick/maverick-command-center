import { describe, expect, it } from "vitest";
import { buildAcquisitionReport, reportingChannel, reportingWindow, type CostEvidence } from "./acquisition-report";
const now=new Date("2026-10-06T13:00:00Z");
const window=reportingWindow("ytd",now);
const cost=(partial:Partial<CostEvidence>):CostEvidence=>({source:"test-ledger",id:"1",channel:"Meta Ads",kind:"media",date:"2026-08-01",amount:100,platformLeads:2,syncedAt:now.toISOString(),currency:"USD",...partial});
const report=(costs:CostEvidence[])=>buildAcquisitionReport({window,costs,cohorts:[],unavailableSources:[],budget:{recurringMonthly:5000,oneTimePlanned:1000},generatedAt:now.toISOString()});
describe("actual acquisition evidence",()=>{
 it("keeps spend-only channels, excludes budget and agency payments from delivered subtotal",()=>{
  const r=report([cost({}),cost({id:"2",kind:"agency_payment",amount:500}),cost({id:"3",kind:"setup_payment",amount:4000})]);
  const c=r.channels.find(c=>c.channel==="Meta Ads")!;
  expect(c.jobRecords).toBe(0);expect(c.recordedDeliveryCost).toBe(100);
  expect(c.agencyPayments).toBe(500);expect(c.setupPayments).toBe(4000);
  expect(r.totals.recordedDeliverySubtotal).toBe(100);expect(r.totals.allChannelCpl).toBeNull();expect(c.fullAcquisitionCost).toBeNull();
 });
 it("preserves null cost, distinguishes observed zero, and retains missing coverage",()=>{
  const c=report([cost({channel:"LSA",amount:null,kind:"lead_charge"})]).channels.find(c=>c.channel==="LSA")!;
  expect(c.recordedDeliveryCost).toBeNull();expect(c.coverage.missingAmounts).toBe(1);
  const zero=report([cost({amount:0})]).channels.find(c=>c.channel==="Meta Ads")!;
  expect(zero.recordedDeliveryCost).toBe(0);expect(zero.platformMediaCpl).toBe(0);
  expect(report([]).totals.recordedDeliverySubtotal).toBeNull();
 });
 it("calculates platform-only CPL from observed rows and keeps customer metrics unavailable",()=>{
  const c=report([cost({amount:250,platformLeads:4})]).channels.find(c=>c.channel==="Meta Ads")!;
  expect(c.platformMediaCpl).toBe(62.5);expect(c.customerCac).toBeNull();expect(c.crmCpl).toBeNull();
  expect(c.coverage.status).toBe("partial_unverified");
 });
 it("never includes future payment rows and flags stale source updates",()=>{
  const c=report([cost({syncedAt:"2026-09-29T11:15:03Z"}),cost({id:"future",date:"2026-10-06",amount:900})]).channels.find(c=>c.channel==="Meta Ads")!;
  expect(c.recordedDeliveryCost).toBe(100);expect(c.evidence).toHaveLength(1);expect(c.coverage.stale).toBe(true);
 });
 it("does not classify Google Business Profile, generic search or social media as paid ads",()=>{
  expect(reportingChannel("Google Business Profile - JNM")).toContain("organic");
  expect(reportingChannel("Google Search")).toContain("unresolved");
  expect(reportingChannel("Social Media")).toBe("Social Media");
  expect(reportingChannel("Roof Ignite - Meta Ads")).toBe("Meta Ads");
 });
});
describe("Central complete-day cohorts",()=>{
 it("uses Central midnight rather than UTC midnight",()=>{
  expect(window.start).toBe("2026-01-01T06:00:00.000Z");
  expect(window.end).toBe("2026-10-06T05:00:00.000Z");
 });
 it("handles DST month boundaries and completed months exclusively",()=>{
  const w=reportingWindow("month:2026-03",now);
  expect(w.start).toBe("2026-03-01T06:00:00.000Z");expect(w.end).toBe("2026-04-01T05:00:00.000Z");
 });
 it("caps before the first complete day of the month without reversing future ranges",()=>{
  expect(reportingWindow("month",new Date("2026-10-01T13:00:00Z")).startDate).toBe("2026-10-01");
  const w=reportingWindow("month:2026-12",now);expect(w.start).toBe(w.end);
 });
});
