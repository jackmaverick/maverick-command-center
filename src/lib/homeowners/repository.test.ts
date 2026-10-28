import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/db", () => ({
  query,
  queryOne: vi.fn(),
}));

import { getCampaignBoard } from "./repository";

describe("campaign board source resilience", () => {
  beforeEach(() => {
    query.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns healthy source cards and warns when another source fails", async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes("FROM seq_enrollments")) {
        return Promise.reject(
          Object.assign(new Error("relation missing"), { code: "42P01" })
        );
      }
      return Promise.resolve([
        {
          id: "member-1",
          campaign_id: "campaign-1",
          campaign_name: "Hail follow-up",
          engine: "marketing",
          state: "ready",
          needs_human: false,
          contact_jnid: "contact-1",
          homeowner_name: "Homeowner",
          job_status: "Estimate Sent",
          sales_rep: "Rep",
          updated_at: "2026-10-28T12:00:00.000Z",
        },
      ]);
    });

    const board = await getCampaignBoard();

    expect(board.campaigns).toHaveLength(1);
    expect(board.campaigns[0].columns.in_progress).toHaveLength(1);
    expect(board.warnings).toEqual([
      {
        source: "sequence",
        message: "Sequence campaigns are temporarily unavailable.",
      },
    ]);
    expect(console.error).toHaveBeenCalledWith(
      "[Campaign Board] sequence source failed",
      { message: "relation missing", code: "42P01" }
    );
  });
});
