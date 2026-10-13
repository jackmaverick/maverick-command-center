import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { queryOne } = vi.hoisted(() => ({ queryOne: vi.fn() }));
vi.mock("@/lib/db", () => ({ queryOne }));

import { GET } from "./route";

const databaseResult = {
  funnel: {
    leads: 647,
    appointmentSetBroad: { count: 557, sampleSize: 647, percent: 86.1 },
    appointmentSetStrict: { count: 302, sampleSize: 647, percent: 46.7 },
    appointmentToSold: { count: 193, sampleSize: 557, percent: 34.6 },
    insuranceSold: { count: 78, sampleSize: 250 },
  },
  persistence: {},
  contact: {},
  sources: [],
  missed_calls: [],
  appointment_to_estimate: {},
  coverage: {},
};

afterEach(() => {
  queryOne.mockReset();
});

describe("front-funnel metrics endpoint", () => {
  it("queries the live migration-10 view for the reference CT cohort", async () => {
    queryOne.mockResolvedValue(databaseResult);

    const response = await GET(
      new NextRequest("https://example.com/api/metrics/front-funnel")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");

    const [sql, params] = queryOne.mock.calls[0];
    expect(sql).toContain("metrics.v_sales_funnel_jobs");
    expect(sql).toContain("metrics.status_funnel_stage");
    expect(sql).toContain("appt_set_broad");
    expect(sql).toContain("appt_set_strict");
    expect(sql).toContain("insurance_sold");
    expect(sql).toContain("call_candidates AS");
    expect(sql).toContain("sms_candidates AS");
    expect(sql).toContain("match_priority DESC");
    expect(sql).not.toMatch(/FROM calls c\s+JOIN LATERAL/);
    expect(sql).not.toMatch(/FROM sms_messages s\s+JOIN LATERAL/);
    expect(sql).not.toContain("Appointment Scheduled");
    expect(params[3]).toBe("2026-04-06");
    expect(params[4]).toBe("2026-10-07");

    const body = await response.json();
    expect(body.funnel).toEqual(databaseResult.funnel);
    expect(body.period.key).toBe("reference");
  });
});
