import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface FAQCandidate {
  id: string;
  question: string;
  answer: string;
  category: string;
  source_type: string;
  confidence: number;
  status: string;
  slug: string;
  seo_keywords: string[];
  seo_intent: string;
  extraction_run_id: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const category = searchParams.get("category") || "all";

    let sql = `
      SELECT id, question, answer, category, source_type, confidence,
             status, slug, seo_keywords, seo_intent, extraction_run_id,
             reviewed_by, reviewed_at, published_at, created_at, updated_at
      FROM faq_candidates
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status !== "all") {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (category !== "all") {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC`;

    const rows = await query<FAQCandidate>(sql, params);

    // Summary counts
    const counts = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count FROM faq_candidates GROUP BY status`
    );

    const summary: Record<string, number> = {};
    for (const row of counts) {
      summary[row.status] = parseInt(row.count, 10);
    }

    return NextResponse.json({
      candidates: rows,
      summary,
      total: rows.length,
    });
  } catch (error) {
    console.error("Error fetching FAQ candidates:", error);
    return NextResponse.json(
      { error: "Failed to fetch FAQ candidates" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action, question, answer, category } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    if (action === "approve") {
      await query(
        `UPDATE faq_candidates
         SET status = 'approved', reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    } else if (action === "reject") {
      await query(
        `UPDATE faq_candidates
         SET status = 'rejected', reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    } else if (action === "edit") {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (question !== undefined) {
        params.push(question);
        updates.push(`question = $${params.length}`);
      }
      if (answer !== undefined) {
        params.push(answer);
        updates.push(`answer = $${params.length}`);
      }
      if (category !== undefined) {
        params.push(category);
        updates.push(`category = $${params.length}`);
      }

      if (updates.length === 0) {
        return NextResponse.json(
          { error: "No fields to update" },
          { status: 400 }
        );
      }

      updates.push("updated_at = NOW()");
      params.push(id);

      await query(
        `UPDATE faq_candidates SET ${updates.join(", ")} WHERE id = $${params.length}`,
        params
      );
    } else if (action === "bulk-approve") {
      const { ids } = body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { error: "Missing ids array" },
          { status: 400 }
        );
      }
      const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(",");
      await query(
        `UPDATE faq_candidates
         SET status = 'approved', reviewed_at = NOW(), updated_at = NOW()
         WHERE id IN (${placeholders})`,
        ids
      );
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use: approve, reject, edit, bulk-approve" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating FAQ candidate:", error);
    return NextResponse.json(
      { error: "Failed to update FAQ candidate" },
      { status: 500 }
    );
  }
}
