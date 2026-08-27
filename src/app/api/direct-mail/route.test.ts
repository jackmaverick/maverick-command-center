import { afterEach, describe, expect, it, vi } from "vitest";

const { loadDirectMailDashboard } = vi.hoisted(() => ({
  loadDirectMailDashboard: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/direct-mail/live-data", () => ({
  loadDirectMailDashboard,
  isDirectMailSchemaUnavailable: (error: unknown) =>
    ["42P01", "42703", "42883"].includes(
      (error as { code?: string })?.code ?? "",
    ),
}));

import { GET } from "./route";

describe("GET /api/direct-mail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    loadDirectMailDashboard.mockReset();
  });

  it("returns the live dashboard response", async () => {
    loadDirectMailDashboard.mockResolvedValue({ available: true });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  });

  it("returns an explicit unavailable response when the schema is missing", async () => {
    loadDirectMailDashboard.mockRejectedValue(Object.assign(new Error("missing"), { code: "42P01" }));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      available: false,
      code: "schema_unavailable",
    });
  });

  it("returns an explicit unavailable response when DATABASE_URL is missing", async () => {
    loadDirectMailDashboard.mockRejectedValue(new Error("DATABASE_URL is not configured"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      available: false,
      code: "configuration_unavailable",
    });
  });

  it("returns a generic error without exposing database details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadDirectMailDashboard.mockRejectedValue(new Error("password authentication failed"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      available: false,
      code: "query_failed",
      message: "Direct-mail reporting could not be loaded.",
    });
  });
});
