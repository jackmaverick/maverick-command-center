import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { weeklySchema } from "@/lib/direct-mail/weekly";
import { mapJobProfit, type ProfitRow } from "@/lib/direct-mail/profit";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const headers = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!id || !/^[a-f0-9]{64}$/.test(id))
    return NextResponse.json(
      { message: "Invalid review" },
      { status: 400, headers },
    );
  try {
    const reviews = await query<{ payload: unknown }>(
      "SELECT payload FROM public.direct_mail_weekly_reviews WHERE id=$1",
      [id],
    );
    if (!reviews.length)
      return NextResponse.json(
        { message: "Review not found" },
        { status: 404, headers },
      );
    const d = weeklySchema.parse(reviews[0].payload);
    if (!d.jobLinks)
      return NextResponse.json(
        { message: "Job links have not yet been published for this review." },
        { status: 409, headers },
      );
    // Membership is the reviewed channel cohort, including archived jobs. Never accept arbitrary job IDs.
    const rows = await query<ProfitRow>(
      `SELECT j.jnid,j.number,j.name,j.status_name,j.updated_at,
      g.revenue_for_gp,g.total_known_cost,g.is_final_gp_ready,g.gp_blockers,t.cost_status,
      g.supplier_material_cost,g.finalized_work_order_cost,g.subcontractor_invoice_cost,
      g.retail_misc_cost,g.permit_cost,h.completion_observed_at
      FROM jobs j LEFT JOIN v_job_final_gp g ON g.job_jnid=j.jnid
      LEFT JOIN v_job_total_costs t ON t.job_jnid=j.jnid
      LEFT JOIN LATERAL (SELECT MIN(changed_at) AS completion_observed_at FROM job_stage_history
        WHERE job_jnid=j.jnid AND to_stage_name IN ('Work Completed Approved','All Work Complete','All Work Completed','Job Completed','Job Close Out','Paid & Closed')) h ON true
      WHERE j.jnid=ANY($1::text[]) AND COALESCE(j.name,'') !~* '(test|dummy|demo|sample|verification|scout_test)'
      AND COALESCE(j.primary_contact_name,'') !~* '(test|dummy|demo|sample|verification)'`,
      [d.jobLinks.map((j) => j.jobId)],
    );
    const byId = new Map(rows.map((r) => [r.jnid, r]));
    return NextResponse.json(
      {
        available: true,
        reviewId: id,
        fetchedAt: new Date().toISOString(),
        jobs: d.jobLinks.map((j) => mapJobProfit(j, byId.get(j.jobId), d)),
      },
      { headers },
    );
  } catch {
    console.error("[Direct Mail] Job profit query unavailable");
    return NextResponse.json(
      {
        message:
          "Job profit is unavailable. Existing mailing results are still available.",
      },
      { status: 503, headers },
    );
  }
}
