import { afterEach, describe, it, expect, vi } from "vitest";
import { weeklyFixture } from "@/lib/direct-mail/weekly-fixture";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));
import { GET } from "./route";
const id = "a".repeat(64);
const request = () =>
  new Request("https://example.com/api/direct-mail/profit?id=" + id);
afterEach(() => {
  vi.restoreAllMocks();
  query.mockReset();
});
describe("job profit endpoint", () => {
  it("rejects invalid selectors without querying", async () => {
    expect(
      (await GET(new Request("https://example.com/?id=invalid"))).status,
    ).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it("does not claim profits before reviewed job links exist", async () => {
    query.mockResolvedValue([{ payload: weeklyFixture() }]);
    expect((await GET(request())).status).toBe(409);
  });
  it("queries only reviewed job IDs and keeps missing jobs unknown", async () => {
    const d = weeklyFixture();
    d.jobLinks = [
      {
        jobId: "job123456789",
        leadMonth: "2026-04",
        campaignId: null,
        linkage: "no_exact_prior_list_match",
      },
    ];
    query.mockResolvedValueOnce([{ payload: d }]).mockResolvedValueOnce([]);
    const r = await GET(request());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(query.mock.calls[1][1]).toEqual([["job123456789"]]);
    const body = await r.json();
    expect(body.jobs[0].grossProfit).toBeNull();
    expect(body.reviewId).toBe(id);
  });
  it("keeps connection details out of failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockRejectedValue(new Error("secret-password"));
    const r = await GET(request());
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
  });
});
