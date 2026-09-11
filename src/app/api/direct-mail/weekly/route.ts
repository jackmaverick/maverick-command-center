import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { weeklySchema, reviewIsStale } from "@/lib/direct-mail/weekly";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const rows = await query<{
      id: string;
      published_at: Date;
      payload: unknown;
    }>(
      `SELECT id, published_at, payload FROM public.direct_mail_weekly_reviews
       ORDER BY as_of DESC, generated_at DESC, published_at DESC LIMIT 1`,
    );
    if (!rows.length)
      return NextResponse.json(
        {
          available: false,
          message: "The first weekly review has not been published yet.",
        },
        { status: 503 },
      );
    const data = weeklySchema.parse(rows[0].payload);
    return NextResponse.json(
      {
        available: true,
        id: rows[0].id,
        publishedAt: rows[0].published_at,
        stale: reviewIsStale(data.asOf),
        data,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch {
    console.error(
      "[Direct Mail Weekly] Review unavailable; database or validation failure",
    );
    return NextResponse.json(
      {
        available: false,
        message:
          "The weekly review could not be loaded. Try refreshing shortly.",
      },
      { status: 503 },
    );
  }
}
