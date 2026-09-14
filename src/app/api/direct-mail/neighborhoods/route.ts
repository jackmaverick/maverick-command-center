import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { query } from "@/lib/db";
import {
  neighborhoodSchema,
  neighborhoodIsStale,
} from "@/lib/direct-mail/neighborhoods";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    let payload: unknown;
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DIRECT_MAIL_NEIGHBORHOOD_REVIEW_PATH
    ) {
      payload = JSON.parse(
        await readFile(
          process.env.DIRECT_MAIL_NEIGHBORHOOD_REVIEW_PATH,
          "utf8",
        ),
      );
    } else {
      const rows = await query<{
        payload: unknown;
      }>(`SELECT payload->'neighborhoodReview' AS payload
        FROM public.direct_mail_weekly_reviews
        ORDER BY as_of DESC, generated_at DESC, published_at DESC LIMIT 1`);
      payload = rows[0]?.payload;
    }
    const data = neighborhoodSchema.parse(payload);
    return NextResponse.json(
      { available: true, stale: neighborhoodIsStale(data.asOf), data },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        available: false,
        message:
          "Neighborhood evidence is unavailable. The prior review may need refreshing.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
