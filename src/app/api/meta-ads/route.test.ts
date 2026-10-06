import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
const { queryMock } = vi.hoisted(()=>({queryMock:vi.fn()}));
vi.mock("@/lib/db",()=>({query:queryMock}));
describe("Meta evidence boundaries",()=>{
 beforeEach(()=>{queryMock.mockReset();});
 it("excludes overlapping breakdowns and does not infer record matches or ROAS",async()=>{
  queryMock.mockResolvedValue([]);
  const response=await GET(new NextRequest("https://example.test/api/meta-ads?period=last_month"));
  const data=await response.json();
  expect(queryMock.mock.calls[0][0]).toContain("breakdown = '{}'::jsonb");
  expect(queryMock.mock.calls[0][0]).toContain("date_start < $3::date");
  expect(data.meta.spend).toBeNull();
  expect(data.attribution.crmMatchRate).toBeNull();expect(data.attribution.unmatchedMetaLeads).toBeNull();
  expect(data.attribution.revenueRoas).toBeNull();expect(data.attribution.costPerMaterialOnlyProfit).toBeNull();
 });
});
