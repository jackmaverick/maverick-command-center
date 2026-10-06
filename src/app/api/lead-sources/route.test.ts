import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: queryMock }));
describe("actual reporting API",()=>{
 beforeEach(()=>{ queryMock.mockReset(); });
 it("exposes failed sources without inventing zero costs",async()=>{
  queryMock.mockImplementation(async(sql:string)=>{
   if(sql.includes("WITH eligible"))return [];
   throw new Error("unavailable");
  });
  const response=await GET(new NextRequest("https://example.test/api/lead-sources?period=ytd"));
  const r=await response.json();expect(response.status).toBe(200);
  expect(r.unavailableSources).toHaveLength(6);expect(r.totals.recordedDeliverySubtotal).toBeNull();
  expect(r.totals.customerCac).toBeNull();expect(r.budget.recurringMonthly).toBeNull();
 });
 it("fails closed when the core CRM query fails",async()=>{
  queryMock.mockRejectedValue(new Error("unavailable"));
  const response=await GET(new NextRequest("https://example.test/api/lead-sources?period=ytd"));
  expect(response.status).toBe(503);
 });
 it("rejects invalid periods before querying",async()=>{
  expect((await GET(new NextRequest("https://example.test/api/lead-sources?period=bad"))).status).toBe(400);
  expect(queryMock).not.toHaveBeenCalled();
 });
 it("uses only nonoverlapping Meta rows and retains nullable costs in SQL",async()=>{
  queryMock.mockResolvedValue([]);
  await GET(new NextRequest("https://example.test/api/lead-sources?period=ytd"));
  const queries=queryMock.mock.calls.map(c=>c[0] as string);
  expect(queries.find(s=>s.includes("FROM meta_ads_daily_insights"))).toContain("breakdown='{}'::jsonb");
  expect(queries.some(s=>s.includes("qbo_purchases"))).toBe(false);
  expect(queries.find(s=>s.includes("FROM marketing_campaigns"))).not.toContain("COALESCE");
  expect(queries.find(s=>s.includes("WITH eligible"))).toContain("deleted_at IS NULL");
 });
});
