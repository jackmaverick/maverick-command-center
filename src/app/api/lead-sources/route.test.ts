import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: queryMock }));

describe("lead source reporting evidence", () => {
  beforeEach(() => queryMock.mockReset());

  it("identifies unavailable spend sources instead of presenting complete cost coverage", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM (marketing_campaigns|lsa_leads|app_recurring_expenses|app_one_time_expenses)/.test(sql)) {
        throw new Error("source unavailable");
      }
      return [];
    });
    const response = await GET(new NextRequest("https://example.test/api/lead-sources?period=last_month"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.reportingNotes.unavailableCostSources.sort()).toEqual([
      "app_one_time_expenses", "app_recurring_expenses", "lsa_leads", "marketing_campaigns",
    ]);
    expect(data.reportingNotes.spendCoverage).toBe("partial_unverified");
    expect(data.acquisition.blendedCac).toBeNull();
  });

  it("does not claim that a successful empty query proves full spend coverage", async () => {
    queryMock.mockResolvedValue([]);
    const response = await GET(new NextRequest("https://example.test/api/lead-sources?period=last_month"));
    const data = await response.json();
    expect(data.reportingNotes.unavailableCostSources).toEqual([]);
    expect(data.reportingNotes.spendCoverage).toBe("partial_unverified");
    expect(data.reportingNotes.acquisitionBasis).toContain("not_customer_cac");
    expect(data.reportingNotes.revenueBasis).toContain("not_collected_cash");
  });
});
