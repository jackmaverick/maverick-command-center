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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from"); // ISO date, optional
    const to = searchParams.get("to");

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (from) {
      clauses.push(`expected_date >= $${params.length + 1}::date`);
      params.push(from);
    }
    if (to) {
      clauses.push(`expected_date <= $${params.length + 1}::date`);
      params.push(to);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const rows = await query<OneTimeRow>(
      `SELECT * FROM app_one_time_expenses ${where} ORDER BY expected_date ASC`,
      params
    );

    return NextResponse.json({ expenses: rows.map(rowToExpense) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[One-Time Expenses GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  amount: z.number().finite().nonnegative(),
  expectedDate: z.string(), // ISO date required
  note: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { name, category, amount, expectedDate, note } = parsed.data;

    const rows = await query<OneTimeRow>(
      `INSERT INTO app_one_time_expenses
         (name, category, amount, expected_date, note, source)
       VALUES ($1, $2, $3, $4::date, $5, 'manual')
       RETURNING *`,
      [name, category, amount, expectedDate, note ?? null]
    );

    return NextResponse.json({ expense: rowToExpense(rows[0]) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[One-Time Expenses POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
