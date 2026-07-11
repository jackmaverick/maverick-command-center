import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export interface DueDateRun {
  run_id: string;
  run_at: string;
  mode: string;
  case_count: number;
  needs_split_count: number;
  review_flag_count: number;
  write_eligible_count: number;
  ar_affected: string;
  is_current: boolean;
}

export interface DueDateCase {
  run_id: string;
  run_at: string;
  mode: string;
  invoice_number: string | null;
  invoice_jnid: string | null;
  invoice_status: string | null;
  job_jnid: string | null;
  job_number: string | null;
  job_name: string | null;
  customer: string | null;
  job_status: string | null;
  due_amount: string | null;
  invoice_total: string | null;
  current_due: string | null;
  proposed_due: string | null;
  days_delta: number | null;
  rule: string | null;
  scope: string | null;
  trade_source: string | null;
  action: "write" | "split" | "review";
  flags: string[] | null;
  confidence: string | null;
  jn_job_url: string | null;
  jn_invoice_url: string | null;
}

export async function GET() {
  try {
    const run = await queryOne<DueDateRun>(
      `SELECT run_id, run_at::text, mode, case_count, needs_split_count,
              review_flag_count, write_eligible_count, ar_affected::text, is_current
       FROM invoice_due_date_runs
       WHERE is_current = true
       ORDER BY run_at DESC
       LIMIT 1`
    );

    if (!run) {
      return NextResponse.json({ run: null, cases: [] });
    }

    const cases = await query<DueDateCase>(
      `SELECT run_id, run_at::text, mode, invoice_number, invoice_jnid,
              invoice_status, job_jnid, job_number, job_name, customer,
              job_status, due_amount::text, invoice_total::text,
              current_due::text, proposed_due::text, days_delta, rule, scope,
              trade_source, action, flags, confidence, jn_job_url, jn_invoice_url
       FROM invoice_due_date_cases
       WHERE run_id = $1
       ORDER BY due_amount DESC NULLS LAST`,
      [run.run_id]
    );

    return NextResponse.json({ run, cases });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Due Dates API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
