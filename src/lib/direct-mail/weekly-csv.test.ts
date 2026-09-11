import { expect, it } from "vitest";
import { encodeCsv, weeklyCsv } from "./weekly-csv";
import { weeklyFixture } from "./weekly-fixture";
it("exports selected month and preserves unknowns", () => {
  const csv = weeklyCsv(
    weeklyFixture(),
    new URLSearchParams({ view: "monthly", month: "2026-09" }),
  );
  expect(csv.split("\r\n")).toHaveLength(2);
  expect(csv).toContain('"Unknown"');
  expect(
    weeklyCsv(
      weeklyFixture(),
      new URLSearchParams({ view: "monthly", month: "2026-08" }),
    ).split("\r\n"),
  ).toHaveLength(1);
});
it("filters list exports and blocks spreadsheet formula injection", () => {
  expect(
    weeklyCsv(
      weeklyFixture(),
      new URLSearchParams({ view: "lists", q: "missing" }),
    ).split("\r\n"),
  ).toHaveLength(1);
  expect(encodeCsv(["Name"], [['=HYPERLINK("x")']])).toContain("'=HYPERLINK");
  expect(encodeCsv(["Value"], [[-0.2]])).toContain('"-0.2"');
});
