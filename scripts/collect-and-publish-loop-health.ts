#!/usr/bin/env tsx
import process from "node:process";
import pg from "pg";

import { buildLoopHealth, type LoopHealthEntry } from "../src/lib/loop-health";

const { Pool } = pg;

const SPECIALIZED_LOOP_IDS = new Set([
  "production-communication-closed-loop",
  "gaf_measurements_to_jobnimbus",
]);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to publish loop health snapshots.");
  process.exit(1);
}

function bestProof(loop: LoopHealthEntry) {
  const preferredStatuses = [
    "failing",
    "stale",
    "warning",
    "healthy",
    "paused",
    "unknown",
  ] as const;
  for (const status of preferredStatuses) {
    const proof = loop.proofs.find((candidate) => candidate.status === status);
    if (proof) return proof;
  }
  return loop.proofs.find((proof) => proof.available) ?? loop.proofs[0] ?? null;
}

async function publish(
  pool: pg.Pool,
  health: Awaited<ReturnType<typeof buildLoopHealth>>,
) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (const loop of health.loops) {
      // This loop has a dedicated 15-minute collector with structured reply,
      // delivery, and active-case evidence. A generic artifact scan must never
      // overwrite its more authoritative snapshot.
      if (SPECIALIZED_LOOP_IDS.has(loop.id)) continue;
      const proof = bestProof(loop);
      await client.query(
        `
          insert into loop_health_snapshots (
            loop_id,
            status,
            ran_at,
            checked_at,
            proof_label,
            proof_path,
            proof_summary,
            proof_evidence,
            last_proof,
            next_action,
            approval_required,
            source_repo_path,
            source_repo,
            source_branch,
            health_source,
            details
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'graph-collector', $15::jsonb)
        `,
        [
          loop.id,
          loop.status,
          proof?.modifiedAt ?? loop.lastObservedAt ?? null,
          health.generatedAt,
          proof?.label ?? null,
          proof?.path ?? null,
          proof?.summary ?? null,
          proof?.evidence ?? null,
          loop.lastProof,
          loop.nextAction,
          loop.approvalRequired,
          loop.sourceRepoPath,
          loop.codexProject.repo,
          loop.codexProject.branch,
          JSON.stringify({
            name: loop.name,
            owner: loop.owner,
            cadence: loop.cadence,
            businessPromise: loop.businessPromise,
            actionSurface: loop.actionSurface,
            graph: loop.graph,
            freshness: loop.freshness,
            localProofs: loop.proofs,
          }),
        ],
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const health = await buildLoopHealth({ includeSnapshots: false });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await publish(pool, health);
  } finally {
    await pool.end();
  }

  console.log(
    JSON.stringify({
      status: "ok",
      generatedAt: health.generatedAt,
      loopsPublished: health.loops.filter(
        (loop) => !SPECIALIZED_LOOP_IDS.has(loop.id),
      ).length,
      summary: health.summary,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
