import { describe, expect, it } from "vitest";

import { LATEST_LOOP_RUNTIME_SIGNALS_SQL } from "./loop-health-snapshots";

describe("runtime signal composition", () => {
  it("selects the latest row per publisher key instead of one global snapshot", () => {
    const sql = LATEST_LOOP_RUNTIME_SIGNALS_SQL.replace(/\s+/g, " ").trim().toLowerCase();

    expect(sql).toContain("distinct on (source, loop_name)");
    expect(sql).toContain("order by source, loop_name, snapshot_at desc");
    expect(sql).not.toContain("max(snapshot_at)");
  });
});
