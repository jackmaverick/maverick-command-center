#!/usr/bin/env node
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const args = new Map(
  process.argv.slice(2).flatMap((arg) => {
    if (!arg.startsWith("--")) return [];
    const raw = arg.slice(2);
    const separator = raw.indexOf("=");
    const key = separator === -1 ? raw : raw.slice(0, separator);
    const value = separator === -1 ? "true" : raw.slice(separator + 1);
    return [[key, value]];
  })
);

const sourceUrl =
  args.get("source") ??
  process.env.LOOP_HEALTH_SOURCE_URL ??
  "http://localhost:3000/api/loop-health?localOnly=1";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to publish loop health snapshots.");
  process.exit(1);
}

async function fetchLoopHealth() {
  const response = await fetch(sourceUrl);
  if (!response.ok && response.status !== 207) {
    throw new Error(`Loop health source returned HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function bestProof(loop) {
  return (
    loop.proofs.find((proof) => proof.status === "failing") ??
    loop.proofs.find((proof) => proof.status === "healthy") ??
    loop.proofs.find((proof) => proof.available) ??
    loop.proofs[0] ??
    null
  );
}

function isoFromDisplay(value) {
  if (!value || value === "Unknown") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function publish(pool, health) {
  const checkedAt = health.generatedAt ?? new Date().toISOString();
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (const loop of health.loops) {
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
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'local-collector', $15::jsonb)
        `,
        [
          loop.id,
          loop.status,
          proof?.modifiedAt ?? isoFromDisplay(loop.lastRun),
          checkedAt,
          proof?.label ?? null,
          proof?.path ?? null,
          proof?.summary ?? null,
          proof?.evidence ?? null,
          loop.lastProof,
          loop.nextAction,
          loop.approvalRequired,
          loop.sourceRepoPath,
          loop.codexProject?.repo ?? null,
          loop.codexProject?.branch ?? null,
          JSON.stringify({
            name: loop.name,
            owner: loop.owner,
            cadence: loop.cadence,
            businessPromise: loop.businessPromise,
            sourceGeneratedAt: health.generatedAt,
            localProofs: loop.proofs,
          }),
        ]
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
  const health = await fetchLoopHealth();
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await publish(pool, health);
  } finally {
    await pool.end();
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        sourceUrl,
        generatedAt: health.generatedAt,
        loopsPublished: health.loops.length,
        summary: health.summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
