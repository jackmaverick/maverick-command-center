import { describe, it, expect } from "vitest";
import {
  mapJobProfit,
  profitTotals,
  campaignProfit,
  type ProfitRow,
  type JobLink,
} from "./profit";
import { weeklyFixture } from "./weekly-fixture";
import { weeklySchema } from "./weekly";
const link: JobLink = {
  jobId: "testjob123456",
  leadMonth: "2026-05",
  campaignId: null,
  linkage: "no_exact_prior_list_match",
};
const row: ProfitRow = {
  jnid: link.jobId,
  number: "2214",
  name: "Example job",
  status_name: "Job Close Out",
  updated_at: null,
  revenue_for_gp: "28600",
  total_known_cost: "19582.23",
  is_final_gp_ready: true,
  gp_blockers: ["non_final_work_orders"],
  cost_status: "partial_labor",
  supplier_material_cost: "11320.73",
  finalized_work_order_cost: "8261.50",
  subcontractor_invoice_cost: "0",
  retail_misc_cost: "0",
  permit_cost: "0",
  completion_observed_at: "2026-09-01T03:00:00Z",
};
describe("Direct Mail job profit", () => {
  it("requires closeout and reopens reconciliation when new review holds arrive", () => {
    const ready={...row,gp_blockers:[],cost_status:"complete"};
    expect(mapJobProfit(link,{...ready,status_name:"Work Completed Approved"}).finalProfit).toBeNull();
    expect(mapJobProfit(link,ready).closeoutStage).toBe("Reconciled");
    const d=weeklyFixture();d.jobCostHolds=[{jobId:link.jobId,reason:"Unclassified adjustment"}];
    const held=mapJobProfit(link,ready,d);
    expect(held.finalProfit).toBeNull();expect(held.closeoutStage).toBe("Closeout review");
  });
  it("keeps invoice-ready profit provisional while costs are unfinished", () => {
    const j = mapJobProfit(link, row);
    expect(j.grossProfit).toBe(9017.77);
    expect(j.finalProfit).toBeNull();
    expect(j.state).toBe("Provisional");
    expect(j.completionMonth).toBe("2026-08");
  });
  it("requires both financial readiness and complete costs", () => {
    const j = mapJobProfit(link, {
      ...row,
      gp_blockers: [],
      cost_status: "complete",
    });
    expect(j.state).toBe("Reconciled");
    expect(j.finalProfit).toBe(9017.77);
    expect(
      mapJobProfit(link, {
        ...row,
        gp_blockers: [],
        cost_status: "complete",
        is_final_gp_ready: false,
      }).finalProfit,
    ).toBeNull();
  });
  it("does not fabricate zero costs or 100 percent profit when a ledger row is missing", () => {
    const j = mapJobProfit(link);
    expect(j.revenue).toBeNull();
    expect(j.grossProfit).toBeNull();
    expect(j.state).toBe("Unavailable");
    expect(profitTotals([j]).grossProfit).toBeNull();
  });
  it("preserves losses, costs on zero-revenue jobs, and deduplicates jobs", () => {
    const j = mapJobProfit(link, {
      ...row,
      revenue_for_gp: 0,
      total_known_cost: 123,
      is_final_gp_ready: false,
    });
    expect(j.grossProfit).toBe(-123);
    expect(j.margin).toBeNull();
    expect(profitTotals([j, j]).grossProfit).toBe(-123);
    expect(profitTotals([j]).invoicedJobs).toBe(0);
  });
  it("does not present no reconciled jobs as zero final profit", () =>
    expect(profitTotals([mapJobProfit(link, row)]).finalProfit).toBeNull());
  it("deducts a modeled list cost once and leaves unassigned jobs out", () => {
    const d = weeklyFixture();
    const id = d.campaigns[0].id;
    d.campaigns[0].requested = 100;
    d.invoices[0].amount = 50;
    d.invoices[0].pieces = 100;
    const j = mapJobProfit(
      { ...link, campaignId: id, linkage: "single_prior_list_address_match" },
      row,
    );
    const p = campaignProfit(
      d,
      [j, mapJobProfit({ ...link, jobId: "another12345" }, row)],
      id,
    );
    expect(p.jobs).toBe(1);
    expect(p.estimatedMailCost).toBe(50);
    expect(p.estimatedContribution).toBe(8967.77);
  });
  it("rejects duplicate IDs, invalid list mappings, and ambiguous assigned links", () => {
    const d = weeklyFixture();
    d.jobLinks = [link, link];
    expect(() => weeklySchema.parse(d)).toThrow();
    d.jobLinks = [{ ...link, campaignId: "missing" }];
    expect(() => weeklySchema.parse(d)).toThrow();
    d.jobLinks = [{ ...link, campaignId: d.campaigns[0].id }];
    expect(() => weeklySchema.parse(d)).toThrow();
  });
});
