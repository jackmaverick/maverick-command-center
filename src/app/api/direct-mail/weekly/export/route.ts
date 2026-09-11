import { query } from "@/lib/db";
import { weeklySchema } from "@/lib/direct-mail/weekly";
import { weeklyCsv } from "@/lib/direct-mail/weekly-csv";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams,
    id = p.get("id"),
    view = p.get("view");
  if (
    !id ||
    !/^[a-f0-9]{64}$/.test(id) ||
    !["monthly", "lists", "actions"].includes(view || "")
  )
    return new Response("Invalid export request", { status: 400 });
  try {
    const rows = await query<{ payload: unknown }>(
      "SELECT payload FROM public.direct_mail_weekly_reviews WHERE id=$1",
      [id],
    );
    if (!rows.length) return new Response("Review not found", { status: 404 });
    const d = weeklySchema.parse(rows[0].payload);
    return new Response(weeklyCsv(d, p), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="direct-mail-${view}-${d.asOf}.csv"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response("Export unavailable; please retry shortly.", {
      status: 503,
    });
  }
}
