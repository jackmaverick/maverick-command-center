import { qboQuery, qboReport, updateLastSync } from "@/lib/quickbooks";
import { query, queryOne } from "@/lib/db";

// ── QBO Entity Types ─────────────────────────────────────────────────────────

interface QBOMetaData {
  CreateTime?: string;
  LastUpdatedTime?: string;
}

interface QBOEntityBase {
  Id: string;
  MetaData?: QBOMetaData;
}

interface QBOInvoice extends QBOEntityBase {
  DocNumber?: string;
  CustomerRef?: { name: string; value: string };
  TotalAmt: number;
  Balance: number;
  DueDate?: string;
  TxnDate: string;
}

interface QBOPayment extends QBOEntityBase {
  CustomerRef?: { name: string; value: string };
  TotalAmt: number;
  TxnDate: string;
  PaymentMethodRef?: { name: string };
  Line?: { LinkedTxn?: { TxnId: string; TxnType: string }[] }[];
}

interface QBODeposit extends QBOEntityBase {
  TotalAmt: number;
  TxnDate: string;
  DepositToAccountRef?: { name: string };
  PrivateNote?: string;
  Line?: Record<string, unknown>[];
}

interface QBOBill extends QBOEntityBase {
  DocNumber?: string;
  VendorRef?: { name: string; value: string };
  TotalAmt: number;
  Balance: number;
  TxnDate: string;
  DueDate?: string;
}

interface QBOPurchase extends QBOEntityBase {
  PaymentType?: string;
  TotalAmt: number;
  TxnDate: string;
  AccountRef?: { name: string };
  EntityRef?: { name: string; type: string };
  PrivateNote?: string;
  Line?: Record<string, unknown>[];
}

interface QBOVendor extends QBOEntityBase {
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Balance: number;
  Active: boolean;
}

interface QBOCreditMemo extends QBOEntityBase {
  DocNumber?: string;
  CustomerRef?: { name: string };
  TotalAmt: number;
  RemainingCredit: number;
  TxnDate: string;
  PrivateNote?: string;
}

interface QBOAccount extends QBOEntityBase {
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  CurrentBalance?: number;
  FullyQualifiedName?: string;
  Active: boolean;
}

interface QBOEstimate extends QBOEntityBase {
  DocNumber?: string;
  CustomerRef?: { name: string };
  TotalAmt: number;
  TxnDate: string;
  ExpirationDate?: string;
  TxnStatus?: string;
  PrivateNote?: string;
}

// ── Sync results ─────────────────────────────────────────────────────────────

export interface EntitySyncResult {
  entity: string;
  rows: number;
  completed: boolean;
  error?: string;
}

export interface IncrementalSyncResult {
  entities: EntitySyncResult[];
  pnlSnapshot: boolean | null; // null = not attempted this run
  fullyCaughtUp: boolean;
  elapsedMs: number;
}

// ── Sync state (cursor per entity) ───────────────────────────────────────────

interface SyncState {
  cursor_ts: string;
  start_position: number;
}

const EPOCH = "1970-01-01T00:00:00Z";

async function getSyncState(entity: string): Promise<SyncState> {
  const row = await queryOne<SyncState>(
    `SELECT cursor_ts, start_position FROM qbo_sync_state WHERE entity = $1`,
    [entity]
  );
  return row ?? { cursor_ts: EPOCH, start_position: 1 };
}

async function saveSyncState(
  entity: string,
  state: SyncState,
  rowCount: number,
  error?: string
): Promise<void> {
  await query(
    `INSERT INTO qbo_sync_state (entity, cursor_ts, start_position, last_run_at, last_row_count, last_error)
     VALUES ($1, $2, $3, NOW(), $4, $5)
     ON CONFLICT (entity) DO UPDATE SET
       cursor_ts = EXCLUDED.cursor_ts, start_position = EXCLUDED.start_position,
       last_run_at = NOW(), last_row_count = EXCLUDED.last_row_count,
       last_error = EXCLUDED.last_error`,
    [entity, state.cursor_ts, state.start_position, rowCount, error ?? null]
  );
}

// ── Batched upsert helper ────────────────────────────────────────────────────

async function batchUpsert(
  table: string,
  columns: string[],
  rows: unknown[][]
): Promise<void> {
  if (rows.length === 0) return;
  const colCount = columns.length;
  const valuesSql = rows
    .map(
      (_, r) =>
        `(${columns.map((_, c) => `$${r * colCount + c + 1}`).join(", ")}, NOW())`
    )
    .join(", ");
  const updateCols = columns.filter((c) => c !== "qbo_id");
  const updates =
    updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(", ") +
    ", last_synced_at = NOW()";
  await query(
    `INSERT INTO ${table} (${columns.join(", ")}, last_synced_at)
     VALUES ${valuesSql}
     ON CONFLICT (qbo_id) DO UPDATE SET ${updates}`,
    rows.flat()
  );
}

// ── Entity sync definitions ──────────────────────────────────────────────────

interface EntitySyncDef {
  entity: string; // QBO entity name (used in QBO query)
  upsertBatch: (items: QBOEntityBase[]) => Promise<void>;
}

const ENTITY_SYNCS: EntitySyncDef[] = [
  {
    entity: "Account",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_accounts",
        ["qbo_id", "name", "account_type", "account_sub_type", "current_balance", "fully_qualified_name", "active", "raw_data"],
        (items as QBOAccount[]).map((a) => [
          a.Id, a.Name, a.AccountType, a.AccountSubType ?? null,
          a.CurrentBalance ?? null, a.FullyQualifiedName ?? null,
          a.Active, JSON.stringify(a),
        ])
      ),
  },
  {
    entity: "Vendor",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_vendors",
        ["qbo_id", "display_name", "company_name", "email", "phone", "balance", "active", "raw_data"],
        (items as QBOVendor[]).map((v) => [
          v.Id, v.DisplayName, v.CompanyName ?? null,
          v.PrimaryEmailAddr?.Address ?? null,
          v.PrimaryPhone?.FreeFormNumber ?? null,
          v.Balance, v.Active, JSON.stringify(v),
        ])
      ),
  },
  {
    entity: "Invoice",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_invoices",
        ["qbo_id", "doc_number", "customer_name", "total_amount", "balance", "due_date", "txn_date", "status", "raw_data"],
        (items as QBOInvoice[]).map((inv) => [
          inv.Id, inv.DocNumber ?? null, inv.CustomerRef?.name ?? null,
          inv.TotalAmt, inv.Balance, inv.DueDate ?? null, inv.TxnDate,
          inv.Balance === 0 ? "Paid" : "Open", JSON.stringify(inv),
        ])
      ),
  },
  {
    entity: "Payment",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_payments",
        ["qbo_id", "customer_name", "total_amount", "txn_date", "payment_method", "linked_invoice_ids", "raw_data"],
        (items as QBOPayment[]).map((pmt) => {
          const linkedIds: string[] = [];
          for (const line of pmt.Line ?? []) {
            for (const txn of line.LinkedTxn ?? []) {
              if (txn.TxnType === "Invoice") linkedIds.push(txn.TxnId);
            }
          }
          return [
            pmt.Id, pmt.CustomerRef?.name ?? null, pmt.TotalAmt, pmt.TxnDate,
            pmt.PaymentMethodRef?.name ?? null, linkedIds, JSON.stringify(pmt),
          ];
        })
      ),
  },
  {
    entity: "Deposit",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_deposits",
        ["qbo_id", "txn_date", "total_amount", "deposit_to_account", "memo", "line_details", "raw_data"],
        (items as QBODeposit[]).map((dep) => [
          dep.Id, dep.TxnDate, dep.TotalAmt,
          dep.DepositToAccountRef?.name ?? null, dep.PrivateNote ?? null,
          JSON.stringify(dep.Line ?? []), JSON.stringify(dep),
        ])
      ),
  },
  {
    entity: "Bill",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_bills",
        ["qbo_id", "doc_number", "vendor_name", "vendor_qbo_id", "total_amount", "balance", "txn_date", "due_date", "status", "raw_data"],
        (items as QBOBill[]).map((bill) => [
          bill.Id, bill.DocNumber ?? null, bill.VendorRef?.name ?? null,
          bill.VendorRef?.value ?? null, bill.TotalAmt, bill.Balance,
          bill.TxnDate, bill.DueDate ?? null,
          bill.Balance === 0 ? "Paid" : "Open", JSON.stringify(bill),
        ])
      ),
  },
  {
    entity: "Purchase",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_purchases",
        ["qbo_id", "payment_type", "txn_date", "total_amount", "account_name", "vendor_name", "memo", "line_details", "raw_data"],
        (items as QBOPurchase[]).map((p) => [
          p.Id, p.PaymentType ?? null, p.TxnDate, p.TotalAmt,
          p.AccountRef?.name ?? null, p.EntityRef?.name ?? null,
          p.PrivateNote ?? null, JSON.stringify(p.Line ?? []), JSON.stringify(p),
        ])
      ),
  },
  {
    entity: "CreditMemo",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_credit_memos",
        ["qbo_id", "doc_number", "customer_name", "total_amount", "balance", "txn_date", "memo", "raw_data"],
        (items as QBOCreditMemo[]).map((cm) => [
          cm.Id, cm.DocNumber ?? null, cm.CustomerRef?.name ?? null,
          cm.TotalAmt, cm.RemainingCredit ?? 0, cm.TxnDate,
          cm.PrivateNote ?? null, JSON.stringify(cm),
        ])
      ),
  },
  {
    entity: "Estimate",
    upsertBatch: (items) =>
      batchUpsert(
        "qbo_estimates",
        ["qbo_id", "doc_number", "customer_name", "total_amount", "txn_date", "expiration_date", "status", "memo", "raw_data"],
        (items as QBOEstimate[]).map((e) => [
          e.Id, e.DocNumber ?? null, e.CustomerRef?.name ?? null,
          e.TotalAmt, e.TxnDate, e.ExpirationDate ?? null,
          e.TxnStatus ?? null, e.PrivateNote ?? null, JSON.stringify(e),
        ])
      ),
  },
];

// ── Incremental entity sync ──────────────────────────────────────────────────

const PAGE_SIZE = 100;

/**
 * Sync one entity incrementally from its saved cursor. Persists progress
 * after every page, so a timeout loses at most one page of work.
 * Pagination contract: query rows strictly newer than cursor_ts, ordered by
 * LastUpdatedTime. Full page → advance start_position (same cursor).
 * Partial/empty page → advance cursor to the newest timestamp seen, reset
 * start_position. Rows updated mid-pagination get a newer timestamp and are
 * picked up by a later run, so nothing is lost.
 */
async function syncEntityIncremental(
  def: EntitySyncDef,
  deadline: number
): Promise<EntitySyncResult> {
  const state = await getSyncState(def.entity);
  let total = 0;
  let maxTsSeen = state.cursor_ts;

  try {
    while (Date.now() < deadline) {
      const page = await qboQuery<QBOEntityBase>(
        `SELECT * FROM ${def.entity} WHERE Metadata.LastUpdatedTime > '${state.cursor_ts}' ORDERBY Metadata.LastUpdatedTime STARTPOSITION ${state.start_position} MAXRESULTS ${PAGE_SIZE}`
      );

      if (page.length > 0) {
        await def.upsertBatch(page);
        total += page.length;
        for (const item of page) {
          const ts = item.MetaData?.LastUpdatedTime;
          if (ts && ts > maxTsSeen) maxTsSeen = ts;
        }
      }

      if (page.length < PAGE_SIZE) {
        // Caught up: move the cursor forward, restart position for next run
        state.cursor_ts = maxTsSeen;
        state.start_position = 1;
        await saveSyncState(def.entity, state, total);
        return { entity: def.entity, rows: total, completed: true };
      }

      // Full page: keep cursor, advance position; persist so a kill resumes here
      state.start_position += PAGE_SIZE;
      await saveSyncState(def.entity, state, total);
    }
    // Ran out of time mid-entity; progress is already persisted
    return { entity: def.entity, rows: total, completed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[QBO Sync] ${def.entity} failed:`, msg);
    await saveSyncState(def.entity, state, total, msg).catch(() => {});
    return { entity: def.entity, rows: total, completed: false, error: msg };
  }
}

// ── P&L snapshot (single report call, current month) ─────────────────────────

async function syncPnlSnapshot(): Promise<boolean> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startStr = startOfMonth.toISOString().split("T")[0];
    const endStr = endOfMonth.toISOString().split("T")[0];

    const report = await qboReport("ProfitAndLoss", {
      start_date: startStr,
      end_date: endStr,
      accounting_method: "Accrual",
    });

    let totalIncome = 0, totalCogs = 0, grossProfit = 0, totalExpenses = 0, netIncome = 0;
    const lineItems: Record<string, number> = {};

    if (report.Rows?.Row) {
      for (const section of report.Rows.Row) {
        const groupName = section.group ?? section.type ?? "";
        const summaryVal = section.Summary?.ColData?.[1]?.value;
        const amount = summaryVal ? parseFloat(summaryVal) : 0;

        if (groupName === "Income") totalIncome = amount;
        else if (groupName === "COGS") totalCogs = amount;
        else if (groupName === "GrossProfit") grossProfit = amount;
        else if (groupName === "Expenses") totalExpenses = amount;
        else if (groupName === "NetIncome") netIncome = amount;

        if (section.Rows?.Row) {
          for (const row of section.Rows.Row) {
            const colData = row.ColData;
            if (colData && colData.length >= 2) {
              const label = colData[0]?.value;
              const val = parseFloat(colData[1]?.value ?? "0");
              if (label) lineItems[`${groupName}:${label}`] = val;
            }
          }
        }
      }
    }

    await query(
      `INSERT INTO qbo_pnl_snapshots (period_start, period_end, total_income, total_cogs, gross_profit, total_expenses, net_income, line_items, raw_report, snapshot_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (period_start, period_end) DO UPDATE SET
         total_income = EXCLUDED.total_income, total_cogs = EXCLUDED.total_cogs,
         gross_profit = EXCLUDED.gross_profit, total_expenses = EXCLUDED.total_expenses,
         net_income = EXCLUDED.net_income, line_items = EXCLUDED.line_items,
         raw_report = EXCLUDED.raw_report, snapshot_at = NOW()`,
      [startStr, endStr, totalIncome, totalCogs, grossProfit,
       totalExpenses, netIncome, JSON.stringify(lineItems),
       JSON.stringify(report)]
    );
    return true;
  } catch (err) {
    console.error("[QBO Sync] P&L snapshot failed:", err);
    return false;
  }
}

// ── Public sync runner ───────────────────────────────────────────────────────

/**
 * Time-boxed incremental sync. Processes entities stalest-cursor-first,
 * stopping cleanly before the deadline. Each completed entity advances
 * qbo_connection.last_sync_at, so partial runs still show progress.
 * On the 15-minute cron cadence, any backlog drains across a few ticks.
 */
export async function runIncrementalQboSync(
  timeBudgetMs: number = 45_000
): Promise<IncrementalSyncResult> {
  const startedAt = Date.now();
  const deadline = startedAt + timeBudgetMs;
  console.log(`[QBO Sync] Starting incremental sync (budget ${timeBudgetMs}ms)`);

  // Stalest entities first so no entity starves if runs keep hitting the budget
  const staleness = await query<{ entity: string }>(
    `SELECT entity FROM qbo_sync_state ORDER BY last_run_at ASC NULLS FIRST`
  );
  const order = new Map(staleness.map((r, i) => [r.entity, i]));
  const defs = [...ENTITY_SYNCS].sort(
    (a, b) => (order.get(a.entity) ?? -1) - (order.get(b.entity) ?? -1)
  );

  const entities: EntitySyncResult[] = [];
  let anyCompleted = false;

  for (const def of defs) {
    if (Date.now() >= deadline) break;
    const result = await syncEntityIncremental(def, deadline);
    entities.push(result);
    console.log(
      `[QBO Sync] ${result.entity}: ${result.rows} rows, ` +
      `${result.completed ? "caught up" : result.error ? `ERROR: ${result.error}` : "time-boxed"}`
    );
    if (result.completed) anyCompleted = true;
  }

  const fullyCaughtUp =
    entities.length === ENTITY_SYNCS.length && entities.every((e) => e.completed);

  let pnlSnapshot: boolean | null = null;
  if (fullyCaughtUp && Date.now() < deadline) {
    pnlSnapshot = await syncPnlSnapshot();
    console.log(`[QBO Sync] P&L snapshot: ${pnlSnapshot ? "saved" : "failed"}`);
  }

  if (anyCompleted) {
    await updateLastSync();
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`[QBO Sync] Done in ${elapsedMs}ms (fullyCaughtUp=${fullyCaughtUp})`);
  return { entities, pnlSnapshot, fullyCaughtUp, elapsedMs };
}
