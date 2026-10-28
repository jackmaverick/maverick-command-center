import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, queryOne } = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query,
  queryOne,
}));

import { getCampaignBoard, getHomeownerDetail } from "./repository";

describe("campaign board source resilience", () => {
  beforeEach(() => {
    query.mockReset();
    queryOne.mockReset();
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
          contactJnid: "contact-1",
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

  it("loads a homeowner from job primary-contact fields when the contact mirror row is missing", async () => {
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        contact_jnid: "stale-contact-id",
        display_name: "Homeowner",
        email: "homeowner@example.com",
        mobile_phone: "9135550100",
        home_phone: null,
        work_phone: null,
        address: "100 Main St",
        disable_auto_text: false,
      })
      .mockResolvedValueOnce({ events: [], freshness: {} });
    query.mockImplementation((sql: string) => {
      if (sql.includes("SELECT DISTINCT") && sql.includes("FROM jobs j")) {
        return Promise.resolve([
          {
            job_jnid: "job-1",
            number: "100",
            name: "Homeowner job",
            address: "100 Main St",
            status: "Estimate Sent",
            sales_rep: "Rep",
            claim_number: null,
            carrier: null,
            date_of_loss: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const detail = await getHomeownerDetail("stale-contact-id", null);

    expect(detail?.contact).toMatchObject({
      contactJnid: "stale-contact-id",
      name: "Homeowner",
      address: "100 Main St",
    });
    expect(detail?.jobs[0]).toMatchObject({
      jobJnid: "job-1",
      status: "Estimate Sent",
    });
  });
});
