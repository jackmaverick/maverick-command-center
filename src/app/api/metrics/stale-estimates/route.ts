import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type StaleEstimateRow = {
  job_jnid: string;
  job_number: string | null;
  job_name: string | null;
  sales_rep_name: string;
  rep_source: string;
  record_type_name: string | null;
  status_changed_at: string;
  age_days: number;
  stale_90: boolean;
  estimate_value: string;
};

export async function GET() {
  try {
    const rows = await query<StaleEstimateRow>(
      `SELECT
         job_jnid,
         job_number,
         job_name,
         sales_rep_name,
         rep_source,
         record_type_name,
         status_changed_at::text,
         age_days,
         stale_90,
         estimate_value::text
       FROM metrics.v_stale_estimates
       WHERE stale_14
       ORDER BY age_days DESC, estimate_value DESC`
    );

    return NextResponse.json(
      {
        summary: {
          jobCount: rows.length,
          totalValue: rows.reduce(
            (sum, row) => sum + (parseFloat(row.estimate_value) || 0),
            0
          ),
          stale90Count: rows.filter((row) => row.stale_90).length,
          timeZone: "America/Chicago",
        },
        jobs: rows.map((row) => ({
          jobJnid: row.job_jnid,
          jobNumber: row.job_number,
          jobName: row.job_name,
          salesRepName: row.sales_rep_name,
          repSource: row.rep_source,
          recordType: row.record_type_name,
          statusChangedAt: row.status_changed_at,
          ageDays: row.age_days,
          stale90: row.stale_90,
          estimateValue: parseFloat(row.estimate_value) || 0,
          jobUrl: `https://app.jobnimbus.com/job/${row.job_jnid}`,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[Stale Estimates API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stale estimates" },
      { status: 500 }
    );
  }
}
