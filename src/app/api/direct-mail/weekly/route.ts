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
       ORDER BY as_of DESC, generated_at DESC, published_at DESC LIMIT 5`,
    );
    if (!rows.length)
      return NextResponse.json(
        {
          available: false,
          message: "The first weekly review has not been published yet.",
        },
        { status: 503 },
      );
    let selected:
      | {
          id: string;
          published_at: Date;
          data: ReturnType<typeof weeklySchema.parse>;
        }
      | undefined;
    for (const row of rows) {
      const parsed = weeklySchema.safeParse(row.payload);
      if (parsed.success) {
        selected = {
          id: row.id,
          published_at: row.published_at,
          data: parsed.data,
        };
        break;
      }
      console.error("[Direct Mail Weekly] Invalid stored review", {
        reviewId: row.id,
        issues: parsed.error.issues.map(({ code, path, message }) => ({
          code,
          path: path.join("."),
          message,
        })),
      });
    }
    if (!selected) throw new Error("No valid weekly review found");
    const fallback = selected.id !== rows[0].id;
    return NextResponse.json(
      {
        available: true,
        id: selected.id,
        publishedAt: selected.published_at,
        stale: reviewIsStale(selected.data.asOf),
        fallback,
        warning: fallback
          ? "The newest publication was invalid, so the last valid review is shown."
          : undefined,
        data: selected.data,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch (error) {
    console.error(
      "[Direct Mail Weekly] Review unavailable",
      { errorType: error instanceof Error ? error.name : typeof error },
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
