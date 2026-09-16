import { describe, it, expect } from "vitest";
import { allocationCost, mailingCosts, returnMetrics, grossProfitPerDollar, allInProjection, type CostAllocation } from "./costs";
import { weeklyFixture } from "./weekly-fixture";
import { weeklySchema } from "./weekly";
const allocation: CostAllocation = { campaignId:"example", invoiceNumber:"1523", vendorCost:212.02, method:"exact", postal:{documentId:"carriage-july",pieces:293,total:102.62,net:73.32,stamps:"in_vendor",evidence:"https://mail.google.com/mail/#all/abc123"},gaps:[],note:"Individual list amount" };
describe("Mailing costs", () => {
  it("counts included stamps once", () => {
    expect(allocationCost(allocation)).toMatchObject({known:285.34,postage:73.32,complete:true});
    expect(allocationCost({...allocation,postal:{...allocation.postal!,stamps:"outside_vendor"}}).known).toBe(314.64);
  });
  it("keeps missing vendor charges and unresolved stamp overlap partial", () => {
    expect(allocationCost({...allocation,vendorCost:null,invoiceNumber:null,method:"pending"})).toMatchObject({known:73.32,complete:false});
    expect(allocationCost({...allocation,postal:{...allocation.postal!,stamps:"unresolved"}})).toMatchObject({known:285.34,complete:false});
    expect(allocationCost({...allocation,vendorCost:null,postal:null}).known).toBeNull();
    expect(mailingCosts(weeklyFixture()).known).toBeNull();
  });
  it("supports negative ROI and does not divide by missing or zero spend", () => {
    expect(returnMetrics(1000,50,100)).toEqual({roas:10,roi:-0.5,contribution:-50});
    expect(returnMetrics(1000,50,0).roas).toBeNull();
    expect(returnMetrics(1000,50,null).contribution).toBeNull();
    expect(grossProfitPerDollar(50, 100)).toBe(0.5);
    expect(grossProfitPerDollar(50, 0)).toBeNull();
    expect(grossProfitPerDollar(null, 100)).toBeNull();
  });
  it("rejects unreconciled allocations and duplicate postal statements", () => {
    const d=weeklyFixture();
    d.costReview={reviewedAt:d.generatedAt,invoiceStamps:d.invoices.map(i=>({number:i.number,amount:0})),allocations:d.campaigns.map((c,i)=>({...allocation,campaignId:c.id,invoiceNumber:d.invoices[0].number,vendorCost:i===0?d.invoices[0].amount:0,postal:null}))};
    expect(weeklySchema.safeParse(d).success).toBe(true);
    d.costReview.allocations[0].vendorCost! += 0.01;
    expect(weeklySchema.safeParse(d).success).toBe(false);
    d.costReview.allocations[0].vendorCost! -= 0.01;
    d.campaigns.push({...d.campaigns[0],id:"second",requested:0});
    d.costReview.allocations.push({...d.costReview.allocations[0],campaignId:"second",vendorCost:0});
    d.costReview.allocations.forEach(a=>a.postal=allocation.postal);
    expect(weeklySchema.safeParse(d).success).toBe(false);
  });
  it("projects full postage after removing stamps already in invoice average", () => {
    const d=weeklyFixture(); d.invoices=[{...d.invoices[0],number:"1523",amount:212.02,pieces:293}];
    d.costReview={reviewedAt:d.generatedAt,invoiceStamps:[{number:"1523",amount:29.3}],allocations:[{...allocation,campaignId:d.campaigns[0].id}]};
    expect(allInProjection(d)).toBeCloseTo(285.34/293,8);
  });
});
