import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import type { OneTimeExpense } from "@/types";

type OneTimeRow = {
  id: string;
  name: string;
  category: string;
  amount: string;
  expected_date: string;
  note: string | null;
  source: string;
  created_at: string;
};

function rowToExpense(r: OneTimeRow): OneTimeExpense {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    amount: parseFloat(r.amount),
    expectedDate: r.expected_date,
    note: r.note,
    source: r.source as OneTimeExpense["source"],
    createdAt: r.created_at,
  };
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  amount: z.number().finite().nonnegative().optional(),
  expectedDate: z.string().optional(),
  note: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const entries = Object.entries(parsed.data).filter(
      ([, v]) => v !== undefined
    );
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const columnMap: Record<string, string> = {
      expectedDate: "expected_date",
    };
    const setClauses = entries.map(
      ([k], i) => `${columnMap[k] ?? k} = $${i + 2}`
    );
    const values = entries.map(([, v]) => v);

    const rows = await query<OneTimeRow>(
      `UPDATE app_one_time_expenses
       SET ${setClauses.join(", ")}
       WHERE id = $1
       RETURNING *`,
      [id, ...values]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ expense: rowToExpense(rows[0]) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[One-Time Expenses PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const rows = await query<{ id: string }>(
      `DELETE FROM app_one_time_expenses WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: rows[0].id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[One-Time Expenses DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
