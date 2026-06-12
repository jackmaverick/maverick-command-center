import { createSign } from "crypto";
import { readFileSync } from "fs";
import { NextResponse } from "next/server";

const CASHFLOW_SHEET_ID = "1iQyts1T__2meVDZu5vudiC4ceKnOb3d16BiewWSiCp4";
const RECURRING_EXPENSES_RANGE = "'Recurring Expenses'!A1:G200";

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type ExpenseRow = {
  name: string;
  category: string;
  amount: number;
  monthlyAmount: number;
  percentOfTotal: number | null;
  frequency: string;
  confidence: string;
  notes: string;
};

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function loadServiceAccountKey(): ServiceAccountKey | null {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline) as ServiceAccountKey;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyPath) return JSON.parse(readFileSync(keyPath, "utf8")) as ServiceAccountKey;

  return null;
}

async function getAccessToken(key: ServiceAccountKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token request failed: ${response.status} ${text}`);
  }

  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("Google token response did not include access_token");
  return body.access_token;
}

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/[$,%\s,]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePercent(value: unknown): number | null {
  const parsed = parseMoney(value);
  return parsed > 0 ? parsed : null;
}

function monthlyAmount(amount: number, frequency: string): number {
  const normalized = frequency.toLowerCase().trim();
  if (normalized.includes("annual") || normalized.includes("year")) return amount / 12;
  if (normalized.includes("quarter")) return amount / 3;
  if (normalized.includes("week")) return amount * 52 / 12;
  if (normalized.includes("day")) return amount * 365 / 12;
  return amount;
}

function normalizeRows(values: unknown[][]): ExpenseRow[] {
  const [, ...body] = values;
  return body
    .map((row) => {
      const amount = parseMoney(row[2]);
      const frequency = String(row[4] ?? "monthly").trim() || "monthly";
      return {
        name: String(row[0] ?? "").trim(),
        category: String(row[1] ?? "Uncategorized").trim() || "Uncategorized",
        amount,
        monthlyAmount: monthlyAmount(amount, frequency),
        percentOfTotal: parsePercent(row[3]),
        frequency,
        confidence: String(row[5] ?? "unknown").trim() || "unknown",
        notes: String(row[6] ?? "").trim(),
      };
    })
    .filter((row) => row.name && row.monthlyAmount > 0 && !/^total$/i.test(row.name));
}

export async function GET() {
  try {
    const key = loadServiceAccountKey();
    if (!key) {
      return NextResponse.json(
        {
          error: "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY is not configured",
          source: "Recurring Expenses tab",
          sheetId: CASHFLOW_SHEET_ID,
        },
        { status: 503 }
      );
    }

    const token = await getAccessToken(key);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CASHFLOW_SHEET_ID}/values/${encodeURIComponent(RECURRING_EXPENSES_RANGE)}?valueRenderOption=UNFORMATTED_VALUE`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Sheets read failed: ${response.status} ${text}`);
    }

    const body = await response.json() as { values?: unknown[][]; range?: string };
    const rows = normalizeRows(body.values ?? []);
    const totalMonthly = rows.reduce((sum, row) => sum + row.monthlyAmount, 0);

    const byCategory = Array.from(
      rows.reduce((map, row) => {
        const existing = map.get(row.category) ?? { category: row.category, monthlyAmount: 0, rows: 0 };
        existing.monthlyAmount += row.monthlyAmount;
        existing.rows += 1;
        map.set(row.category, existing);
        return map;
      }, new Map<string, { category: string; monthlyAmount: number; rows: number }>()).values()
    )
      .map((row) => ({
        ...row,
        percentOfTotal: totalMonthly > 0 ? (row.monthlyAmount / totalMonthly) * 100 : 0,
      }))
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: {
        sheetId: CASHFLOW_SHEET_ID,
        tab: "Recurring Expenses",
        range: body.range ?? RECURRING_EXPENSES_RANGE,
        url: `https://docs.google.com/spreadsheets/d/${CASHFLOW_SHEET_ID}/edit?gid=789005809#gid=789005809`,
      },
      summary: {
        totalMonthly: Math.round(totalMonthly),
        totalAnnualized: Math.round(totalMonthly * 12),
        expenseCount: rows.length,
        highConfidenceCount: rows.filter((row) => row.confidence.toLowerCase() === "high").length,
      },
      byCategory: byCategory.map((row) => ({
        ...row,
        monthlyAmount: Math.round(row.monthlyAmount),
        percentOfTotal: Math.round(row.percentOfTotal * 10) / 10,
      })),
      topExpenses: rows
        .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
        .slice(0, 12)
        .map((row) => ({
          ...row,
          amount: Math.round(row.amount),
          monthlyAmount: Math.round(row.monthlyAmount),
          percentOfTotal: row.percentOfTotal === null ? null : Math.round(row.percentOfTotal * 10) / 10,
        })),
      notes: [
        "Read-only from the Recurring Expenses tab. Update that sheet tab to change what appears here.",
        "Amounts are normalized to monthly run-rate based on the Frequency column.",
        "This is planned operating expense, not verified bank/QBO actuals. Treat it as editable forecast input until QBO actuals are reconciled.",
      ],
    });
  } catch (error) {
    console.error("[Pipeline Cashflow Operating Expenses API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch operating expenses" },
      { status: 500 }
    );
  }
}
