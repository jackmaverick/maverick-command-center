import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import type { RecurringExpense } from "@/types";

type RecurringRow = {
  id: string;
  name: string;
  category: string;
  amount: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  source: string;
  confidence: string | null;
  created_at: string;
  updated_at: string;
};

function rowToExpense(r: RecurringRow): RecurringExpense {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    amount: parseFloat(r.amount),
    frequency: r.frequency as RecurringExpense["frequency"],
    startDate: r.start_date,
    endDate: r.end_date,
    notes: r.notes,
    source: r.source as RecurringExpense["source"],
    confidence: r.confidence as RecurringExpense["confidence"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    // Active = started on/before today AND (no end_date OR end_date >= today)
    const rows = await query<RecurringRow>(
      activeOnly
        ? `SELECT * FROM app_recurring_expenses
           WHERE start_date <= CURRENT_DATE
             AND (end_date IS NULL OR end_date >= CURRENT_DATE)
           ORDER BY amount DESC`
        : `SELECT * FROM app_recurring_expenses
           ORDER BY end_date NULLS FIRST, amount DESC`
    );

    return NextResponse.json({ expenses: rows.map(rowToExpense) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Recurring Expenses GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  amount: z.number().finite().nonnegative(),
  frequency: z
    .enum(["monthly", "weekly", "biweekly", "quarterly", "annual"])
    .default("monthly"),
  startDate: z.string().optional(), // ISO date; defaults to today
  endDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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
    const { name, category, amount, frequency, startDate, endDate, notes } =
      parsed.data;

    const rows = await query<RecurringRow>(
      `INSERT INTO app_recurring_expenses
         (name, category, amount, frequency, start_date, end_date, notes, source)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6::date, $7, 'manual')
       RETURNING *`,
      [name, category, amount, frequency, startDate ?? null, endDate ?? null, notes ?? null]
    );

    return NextResponse.json({ expense: rowToExpense(rows[0]) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Recurring Expenses POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
