#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply the loop health migration.");
  process.exit(1);
}

const migrations = [
  "002_loop_health_snapshots.sql",
  "003_loop_health_graph_statuses.sql",
  "004_loop_health_snapshot_grants.sql",
];
const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  idleTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

try {
  for (const migration of migrations) {
    const sql = await readFile(new URL(`../drizzle/migrations/${migration}`, import.meta.url), "utf8");
    await pool.query(sql);
  }
  console.log(
    JSON.stringify(
      {
        status: "ok",
        migrations,
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
