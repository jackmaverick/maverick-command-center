import { afterEach, describe, it, expect, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));
import { GET } from "./route";
afterEach(() => {
  query.mockReset();
  vi.unstubAllEnvs();
});
describe("GET neighborhood review", () => {
  it("does not return private fields or connection details", async () => {
    query.mockResolvedValue([{ payload: { recipients: ["private address"] } }]);
    let response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private address",
    );
    query.mockRejectedValue(new Error("secret credential"));
    response = await GET();
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("ignores the local file override in production and does not revive an older review", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DIRECT_MAIL_NEIGHBORHOOD_REVIEW_PATH",
      "/nonexistent/private.json",
    );
    query.mockResolvedValue([{ payload: null }]);
    const response = await GET();
    expect(query).toHaveBeenCalledOnce();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
