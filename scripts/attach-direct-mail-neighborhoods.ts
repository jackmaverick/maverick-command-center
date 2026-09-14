/** Prepare a complete existing weekly snapshot with the neighborhood extension. No database writes. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { weeklySchema } from "../src/lib/direct-mail/weekly";
import {
  neighborhoodSchema,
  neighborhoodIsStale,
} from "../src/lib/direct-mail/neighborhoods";

async function main() {
  const [weeklyPath, neighborhoodPath, outputPath] = process.argv.slice(2);
  if (!weeklyPath || !neighborhoodPath || !outputPath)
    throw new Error(
      "Supply existing weekly JSON, neighborhood JSON, and a private output path",
    );
  const weekly = weeklySchema.parse(
    JSON.parse(await readFile(resolve(weeklyPath), "utf8")),
  );
  const neighborhood = neighborhoodSchema.parse(
    JSON.parse(await readFile(resolve(neighborhoodPath), "utf8")),
  );
  if (neighborhoodIsStale(neighborhood.asOf))
    throw new Error(
      "Refresh stale neighborhood evidence before preparing publication",
    );
  const prepared = weeklySchema.parse({
    ...weekly,
    neighborhoodReview: neighborhood,
    generatedAt: new Date().toISOString(),
    sourceHash: createHash("sha256")
      .update(JSON.stringify([weekly.sourceHash, neighborhood.sourceHash]))
      .digest("hex"),
  });
  await writeFile(
    resolve(outputPath),
    JSON.stringify(prepared, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      mode: "prepared-not-published",
      weeklyAsOf: prepared.asOf,
      neighborhoodAsOf: neighborhood.asOf,
      opportunities: neighborhood.opportunities.length,
      databaseWrites: 0,
    }),
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Could not prepare neighborhood publication",
  );
  process.exitCode = 1;
});
