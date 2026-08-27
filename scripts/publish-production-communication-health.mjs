#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const healthPath =
  process.env.PRODUCTION_COMMUNICATION_HEALTH_PATH ??
  "/Users/maverick_ai/supabase-maverick-exteriors/reports/production-communication-graph/health-latest.json";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to publish production communication health.");
}

const health = JSON.parse(await readFile(healthPath, "utf8"));
const ranAt = new Date(health.ran_at);
if (Number.isNaN(ranAt.getTime())) throw new Error(`Invalid health ran_at: ${health.ran_at}`);

const ageMinutes = (Date.now() - ranAt.getTime()) / 60000;
const status = ageMinutes >= 120 ? "failing" : ageMinutes >= 45 ? "warning" : health.status;
const staleSummary =
  ageMinutes >= 120
    ? `Heartbeat is ${Math.round(ageMinutes)} minutes old; graph monitor may be down.`
    : ageMinutes >= 45
      ? `Heartbeat is ${Math.round(ageMinutes)} minutes old; verify the graph monitor.`
      : null;
const proofSummary = staleSummary ?? health.proof_summary;
const nextAction = staleSummary
  ? "Open the Loop Health repair prompt, inspect com.maverick.production-communication-graph, and rerun the monitor dry-run."
  : health.next_action;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

try {
  await pool.query(
    `
      insert into loop_health_snapshots (
        loop_id, status, ran_at, checked_at, proof_label, proof_path,
        proof_summary, proof_evidence, last_proof, next_action,
        approval_required, source_repo_path, source_repo, source_branch,
        health_source, details
      ) values (
        $1, $2, $3, now(), $4, $5,
        $6, $7, $8, $9,
        false, $10, $11, $12,
        'production-communication-collector', $13::jsonb
      )
    `,
    [
      "production-communication-closed-loop",
      status,
      ranAt.toISOString(),
      "production communication graph heartbeat",
      healthPath,
      proofSummary,
      JSON.stringify({
        cadenceMinutes: health.cadence_minutes,
        replyWindowHours: health.reply_window_hours,
        activeTeamCases: health.active_team_cases,
        newTeamCases: health.new_team_cases,
      }),
      proofSummary,
      nextAction,
      "/Users/maverick_ai/supabase-maverick-exteriors/scripts/production_communication_graph.py",
      "jackmaverick/supabase-maverick-exteriors",
      "codex/daily-production-check",
      JSON.stringify({ ...health, heartbeatAgeMinutes: ageMinutes }),
    ]
  );
} finally {
  await pool.end();
}

console.log(
  JSON.stringify({
    loopId: "production-communication-closed-loop",
    status,
    ranAt: ranAt.toISOString(),
    heartbeatAgeMinutes: Math.round(ageMinutes * 10) / 10,
  })
);
