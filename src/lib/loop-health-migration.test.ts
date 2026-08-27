import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), "drizzle/migrations", name), "utf8")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("loop health snapshot grants", () => {
  it.each(["002_loop_health_snapshots.sql", "004_loop_health_snapshot_grants.sql"])(
    "grants table and sequence access in %s",
    (name) => {
      const sql = migration(name);

      expect(sql).toContain(
        "grant select, insert on table loop_health_snapshots to service_role;",
      );
      expect(sql).toContain(
        "grant usage, select on sequence loop_health_snapshots_id_seq to service_role;",
      );
    },
  );
});
