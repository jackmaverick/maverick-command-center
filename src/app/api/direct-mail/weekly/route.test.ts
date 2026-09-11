import { afterEach, describe, it, expect, vi } from "vitest";
import { weeklyFixture } from "@/lib/direct-mail/weekly-fixture";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));
import { GET } from "./route";
afterEach(() => {
  vi.restoreAllMocks();
  query.mockReset();
});
describe("GET weekly review", () => {
  it("returns validated aggregate data without caching", async () => {
    query.mockResolvedValue([
      {
        id: "a".repeat(64),
        published_at: new Date(),
        payload: weeklyFixture(),
      },
    ]);
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await r.json()).data.summary.roas).toBeNull();
  });
  it("shows unavailable when no review exists", async () => {
    query.mockResolvedValue([]);
    const r = await GET();
    expect(r.status).toBe(503);
    expect((await r.json()).available).toBe(false);
  });
  it("fails closed if a stored payload has private fields", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockResolvedValue([
      { payload: { ...weeklyFixture(), addresses: ["private"] } },
    ]);
    const r = await GET();
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("private");
  });
  it("does not expose connection errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockRejectedValue(new Error("secret connection string"));
    const r = await GET();
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
  });
});
