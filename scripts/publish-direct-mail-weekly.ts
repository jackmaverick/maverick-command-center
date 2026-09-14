/** Explicit local publisher. No HTTP write route, email sending, or CRM writes. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { Pool } from "pg";
import { weeklySchema } from "../src/lib/direct-mail/weekly";
async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  if (!input)
    throw new Error(
      "Usage: tsx scripts/publish-direct-mail-weekly.ts INPUT.json [--apply] [--migrate]",
    );
  const payload = weeklySchema.parse(
    JSON.parse(await readFile(resolve(input), "utf8")),
  );
  const body = JSON.stringify(payload);
  const id = createHash("sha256").update(body).digest("hex");
  if (!args.includes("--apply")) {
    console.log(
      JSON.stringify({
        mode: "validation-only",
        id,
        asOf: payload.asOf,
        leads: payload.summary.leads,
        requested: payload.summary.requested,
      }),
    );
  } else {
    if (!process.env.DATABASE_URL)
      throw new Error(
        "Load DATABASE_URL from the existing ignored environment file",
      );
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      if (args.includes("--migrate"))
        await pool.query(
          await readFile(
            resolve(
              __dirname,
              "../supabase/migrations/20260911190000_direct_mail_weekly_reviews.sql",
            ),
            "utf8",
          ),
        );
      await pool.query(
        `INSERT INTO public.direct_mail_weekly_reviews(id,as_of,generated_at,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING`,
        [id, payload.asOf, payload.generatedAt, body],
      );
      const readback = await pool.query(
        "SELECT id,payload FROM public.direct_mail_weekly_reviews WHERE id=$1",
        [id],
      );
      if (
        !readback.rows[0] ||
        !isDeepStrictEqual(weeklySchema.parse(readback.rows[0].payload), payload)
      )
        throw new Error("Published readback mismatch");
      const proof = {
        mode: "published",
        id,
        asOf: payload.asOf,
        verifiedAt: new Date().toISOString(),
        records: 1,
        crmWrites: 0,
        sends: 0,
      };
      await writeFile(
        resolve(input) + ".publication.json",
        JSON.stringify(proof, null, 2),
      );
      console.log(JSON.stringify(proof));
    } finally {
      await pool.end();
    }
  }
}
main().catch(() => {
  console.error(
    "Publication failed. Check input validation and database configuration; no success is claimed.",
  );
  process.exitCode = 1;
});
