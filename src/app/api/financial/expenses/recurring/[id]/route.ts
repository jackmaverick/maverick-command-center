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

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  amount: z.number().finite().nonnegative().optional(),
  frequency: z
    .enum(["monthly", "weekly", "biweekly", "quarterly", "annual"])
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PATCH is the primary edit surface. Non-destructive: to retire a row,
// set endDate to the last day it applies. The row stays in the table for history.
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

    // Build a dynamic SET clause from whichever fields were provided
    const entries = Object.entries(parsed.data).filter(
      ([, v]) => v !== undefined
    );
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Map camelCase → snake_case for DB columns
    const columnMap: Record<string, string> = {
      startDate: "start_date",
      endDate: "end_date",
    };

    const setClauses = entries.map(
      ([k], i) => `${columnMap[k] ?? k} = $${i + 2}`
    );
    const values = entries.map(([, v]) => v);

    const rows = await query<RecurringRow>(
      `UPDATE app_recurring_expenses
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
    console.error("[Recurring Expenses PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Hard delete — only for correcting mistakes. Prefer PATCH with endDate to retire.
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const rows = await query<{ id: string }>(
      `DELETE FROM app_recurring_expenses WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!rows.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: rows[0].id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Recurring Expenses DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
