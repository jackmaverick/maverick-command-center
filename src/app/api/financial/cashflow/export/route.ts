import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { query } from "@/lib/db";

// Dollar formatter for CSV cells (no symbol, just number)
const fmt = (n: number | null) =>
  n === null ? "" : n.toFixed(2);

// Escape a CSV field — double quotes + wrap if contains comma/newline/quote
function csv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

type RecurringRow = {
  name: string;
  category: string;
  amount: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  source: string;
  confidence: string | null;
  notes: string | null;
};

type OneTimeRow = {
  name: string;
  category: string;
  amount: string;
  expected_date: string;
  note: string | null;
};

export async function GET(_request: NextRequest) {
  try {
    // Read straight from DB — keeps this endpoint cheap and independent of QBO
    const [recurring, oneTime, settings] = await Promise.all([
      query<RecurringRow>(
        `SELECT name, category, amount, frequency, start_date, end_date,
                source, confidence, notes
         FROM app_recurring_expenses
         ORDER BY end_date NULLS FIRST, amount DESC`
      ),
      query<OneTimeRow>(
        `SELECT name, category, amount, expected_date, note
         FROM app_one_time_expenses
         ORDER BY expected_date ASC`
      ),
      query<{ key: string; value: unknown }>(
        `SELECT key, value FROM app_settings
         WHERE key IN ('cashflow_safety_floor', 'cashflow_cogs_ratio', 'cashflow_seed_method')`
      ),
    ]);

    const settingsMap = Object.fromEntries(
      settings.map((s) => [s.key, s.value])
    );

    const lines: string[] = [];
    const stamp = format(new Date(), "yyyy-MM-dd HH:mm");

    lines.push(`Maverick Exteriors — Cash Flow Export`);
    lines.push(`Generated,${stamp}`);
    lines.push(`Safety Floor,${settingsMap.cashflow_safety_floor ?? ""}`);
    lines.push(`COGS Ratio,${settingsMap.cashflow_cogs_ratio ?? ""}`);
    lines.push(`Seed Method,${csv(settingsMap.cashflow_seed_method ?? "")}`);
    lines.push("");

    lines.push("RECURRING EXPENSES");
    lines.push(
      "Name,Category,Amount,Frequency,Start,End,Source,Confidence,Notes"
    );
    for (const r of recurring) {
      lines.push(
        [
          csv(r.name),
          csv(r.category),
          fmt(parseFloat(r.amount)),
          r.frequency,
          r.start_date,
          r.end_date ?? "",
          r.source,
          r.confidence ?? "",
          csv(r.notes),
        ].join(",")
      );
    }
    lines.push("");

    lines.push("ONE-TIME EXPENSES");
    lines.push("Name,Category,Amount,Expected Date,Note");
    for (const o of oneTime) {
      lines.push(
        [
          csv(o.name),
          csv(o.category),
          fmt(parseFloat(o.amount)),
          o.expected_date,
          csv(o.note),
        ].join(",")
      );
    }
    lines.push("");

    const csvBody = lines.join("\n");
    const filename = `maverick-cashflow-${format(new Date(), "yyyy-MM-dd")}.csv`;

    return new NextResponse(csvBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Cashflow Export]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
