import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import {
  isSheetsConfigured,
  ensureTab,
  appendRows,
  updateRange,
} from "@/lib/google-sheets";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── GET/POST /api/qbo/sheet-sync ─────────────────────────────────────────────
// Writes the current QuickBooks bank balance into Brent's cash-flow sheet:
//   1. Appends a dated row to a history tab (trend) — safe, additive.
//   2. Optionally overwrites a single "current cash" cell so the whole
//      workbook recomputes — only when CASHFLOW_CASH_CELL is set.
//
// Config (env):
//   CASHFLOW_SHEET_ID     spreadsheet id (defaults to the cash-flow workbook)
//   CASHFLOW_HISTORY_TAB  history tab name (default "Daily Bank Balance")
//   CASHFLOW_CASH_CELL    optional live cell, e.g. "AVAILABLE TO SPEND!B5"
//   GOOGLE_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY  service-account auth
//
// Auth: x-cron-secret header or Bearer must match CRON_SECRET (if set).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SHEET_ID = "1iQyts1T__2meVDZu5vudiC4ceKnOb3d16BiewWSiCp4";
const DEFAULT_HISTORY_TAB = "Daily Bank Balance";
const HISTORY_HEADER = ["Date", "Account", "Balance", "Synced At (QBO)"];

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return (
    req.headers.get("x-cron-secret") === cronSecret ||
    req.headers.get("authorization") === `Bearer ${cronSecret}`
  );
}

/** Today's date as YYYY-MM-DD in Central Time (the business's timezone). */
function todayCentral(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface BankAccount {
  name: string;
  current_balance: string | number;
  last_synced_at: string;
}

async function handleSync(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSheetsConfigured()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:
        "Google service-account env not set. Set GOOGLE_SERVICE_ACCOUNT_JSON (full key " +
        "JSON), then share the sheet with that service account's email.",
    });
  }

  try {
    // The operating account = the Bank-type account with the largest balance.
    const account = await queryOne<BankAccount>(
      `SELECT name, current_balance, last_synced_at
         FROM qbo_accounts
        WHERE account_type = 'Bank'
        ORDER BY current_balance DESC NULLS LAST
        LIMIT 1`
    );

    if (!account) {
      return NextResponse.json(
        { success: false, error: "No QBO bank account found. Run /api/qbo/cron first." },
        { status: 404 }
      );
    }

    const sheetId = process.env.CASHFLOW_SHEET_ID || DEFAULT_SHEET_ID;
    const historyTab = process.env.CASHFLOW_HISTORY_TAB || DEFAULT_HISTORY_TAB;
    const balance = Number(account.current_balance);
    const date = todayCentral();

    // 1. Append a dated history row (creates the tab + header on first run).
    await ensureTab(sheetId, historyTab, HISTORY_HEADER);
    await appendRows(sheetId, `${historyTab}!A1`, [
      [date, account.name, balance, account.last_synced_at],
    ]);

    // 2. Optionally refresh the live "current cash" cell so the sheet recomputes.
    const cashCell = process.env.CASHFLOW_CASH_CELL;
    let updatedCell: string | null = null;
    if (cashCell) {
      await updateRange(sheetId, cashCell, [[balance]]);
      updatedCell = cashCell;
    }

    return NextResponse.json({
      success: true,
      source: "qbo-sheet-sync",
      date,
      account: account.name,
      balance,
      qboSyncedAt: account.last_synced_at,
      historyTab,
      updatedCell,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Sheet Sync] Error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
