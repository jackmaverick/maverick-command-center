import { query } from "@/lib/db";
import type { LoopStatus } from "@/lib/loop-registry";

export interface LoopHealthSnapshot {
  loopId: string;
  status: LoopStatus;
  ranAt: string | null;
  checkedAt: string;
  proofLabel: string | null;
  proofPath: string | null;
  proofSummary: string | null;
  proofEvidence: string | null;
  lastProof: string | null;
  nextAction: string | null;
  approvalRequired: boolean;
  sourceRepoPath: string | null;
  sourceRepo: string | null;
  sourceBranch: string | null;
  healthSource: string;
  details: Record<string, unknown>;
}

type SnapshotRow = {
  loop_id: string;
  status: LoopStatus;
  ran_at: string | Date | null;
  checked_at: string | Date;
  proof_label: string | null;
  proof_path: string | null;
  proof_summary: string | null;
  proof_evidence: string | null;
  last_proof: string | null;
  next_action: string | null;
  approval_required: boolean;
  source_repo_path: string | null;
  source_repo: string | null;
  source_branch: string | null;
  health_source: string;
  details: Record<string, unknown> | null;
};

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function fetchLatestLoopHealthSnapshots(): Promise<Map<string, LoopHealthSnapshot>> {
  if (!process.env.DATABASE_URL) return new Map();

  try {
    const rows = await query<SnapshotRow>(`
      select distinct on (loop_id)
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
      from loop_health_snapshots
      order by loop_id, checked_at desc
    `);

    return new Map(
      rows.map((row) => [
        row.loop_id,
        {
          loopId: row.loop_id,
          status: row.status,
          ranAt: iso(row.ran_at),
          checkedAt: iso(row.checked_at) ?? new Date().toISOString(),
          proofLabel: row.proof_label,
          proofPath: row.proof_path,
          proofSummary: row.proof_summary,
          proofEvidence: row.proof_evidence,
          lastProof: row.last_proof,
          nextAction: row.next_action,
          approvalRequired: row.approval_required,
          sourceRepoPath: row.source_repo_path,
          sourceRepo: row.source_repo,
          sourceBranch: row.source_branch,
          healthSource: row.health_source,
          details: row.details ?? {},
        },
      ])
    );
  } catch (error) {
    console.warn("[loop-health] Supabase snapshot read unavailable:", error);
    return new Map();
  }
}
