import { describe, expect, it } from "vitest";
import { getInbox } from "./repository";

describe.runIf(Boolean(process.env.DATABASE_URL))(
  "campaign inbox database integration",
  () => {
    it("loads the Insurance board within the preview performance budget", async () => {
      const startedAt = performance.now();
      const result = await getInbox("insurance", {
        search: "",
        page: 0,
        pageSize: 50,
        open: "any",
        unread: false,
        unresponded: false,
        board: true,
      });
      const durationMs = performance.now() - startedAt;

      expect(result.warnings).toEqual([]);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.columns.some((column) => column.count > 0)).toBe(true);
      expect(durationMs).toBeLessThan(2_000);
    });
  }
);
