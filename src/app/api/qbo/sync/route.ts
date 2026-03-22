import { NextResponse } from "next/server";
import { qboQuery, qboReport, updateLastSync } from "@/lib/quickbooks";
import { query } from "@/lib/db";

// ── QBO Entity Types ─────────────────────────────────────────────────────────

interface QBOInvoice {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { name: string; value: string };
  TotalAmt: number;
  Balance: number;
  DueDate?: string;
  TxnDate: string;
}

interface QBOPayment {
  Id: string;
  CustomerRef?: { name: string; value: string };
  TotalAmt: number;
  TxnDate: string;
  PaymentMethodRef?: { name: string };
  Line?: { LinkedTxn?: { TxnId: string; TxnType: string }[] }[];
}

interface QBODeposit {
  Id: string;
  TotalAmt: number;
  TxnDate: string;
  DepositToAccountRef?: { name: string };
  PrivateNote?: string;
  Line?: Record<string, unknown>[];
}

interface QBOBill {
  Id: string;
  DocNumber?: string;
  VendorRef?: { name: string; value: string };
  TotalAmt: number;
  Balance: number;
  TxnDate: string;
  DueDate?: string;
}

interface QBOPurchase {
  Id: string;
  PaymentType?: string;
  TotalAmt: number;
  TxnDate: string;
  AccountRef?: { name: string };
  EntityRef?: { name: string; type: string };
  PrivateNote?: string;
  Line?: Record<string, unknown>[];
}

interface QBOVendor {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Balance: number;
  Active: boolean;
}

interface QBOCreditMemo {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { name: string };
  TotalAmt: number;
  RemainingCredit: number;
  TxnDate: string;
  PrivateNote?: string;
}

interface QBOAccount {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  CurrentBalance?: number;
  FullyQualifiedName?: string;
  Active: boolean;
}

interface QBOEstimate {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { name: string };
  TotalAmt: number;
  TxnDate: string;
  ExpirationDate?: string;
  TxnStatus?: string;
  PrivateNote?: string;
}

// ── Sync counts ──────────────────────────────────────────────────────────────

interface SyncResult {
  invoices: number;
  payments: number;
  deposits: number;
  bills: number;
  purchases: number;
  vendors: number;
  creditMemos: number;
  accounts: number;
  estimates: number;
  pnlSnapshot: boolean;
}

// ── Sync logic ───────────────────────────────────────────────────────────────

async function syncInvoices(): Promise<number> {
  const invoices = await qboQuery<QBOInvoice>(
    "SELECT * FROM Invoice MAXRESULTS 1000"
  );
  for (const inv of invoices) {
    const status = inv.Balance === 0 ? "Paid" : "Open";
    await query(
      `INSERT INTO qbo_invoices (qbo_id, doc_number, customer_name, total_amount, balance, due_date, txn_date, status, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         doc_number = EXCLUDED.doc_number, customer_name = EXCLUDED.customer_name,
         total_amount = EXCLUDED.total_amount, balance = EXCLUDED.balance,
         due_date = EXCLUDED.due_date, txn_date = EXCLUDED.txn_date,
         status = EXCLUDED.status, raw_data = EXCLUDED.raw_data, last_synced_at = NOW()`,
      [inv.Id, inv.DocNumber ?? null, inv.CustomerRef?.name ?? null,
       inv.TotalAmt, inv.Balance, inv.DueDate ?? null, inv.TxnDate,
       status, JSON.stringify(inv)]
    );
  }
  return invoices.length;
}

async function syncPayments(): Promise<number> {
  const payments = await qboQuery<QBOPayment>(
    "SELECT * FROM Payment MAXRESULTS 1000"
  );
  for (const pmt of payments) {
    const linkedIds: string[] = [];
    if (pmt.Line) {
      for (const line of pmt.Line) {
        if (line.LinkedTxn) {
          for (const txn of line.LinkedTxn) {
            if (txn.TxnType === "Invoice") linkedIds.push(txn.TxnId);
          }
        }
      }
    }
    await query(
      `INSERT INTO qbo_payments (qbo_id, customer_name, total_amount, txn_date, payment_method, linked_invoice_ids, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         customer_name = EXCLUDED.customer_name, total_amount = EXCLUDED.total_amount,
         txn_date = EXCLUDED.txn_date, payment_method = EXCLUDED.payment_method,
         linked_invoice_ids = EXCLUDED.linked_invoice_ids, raw_data = EXCLUDED.raw_data,
         last_synced_at = NOW()`,
      [pmt.Id, pmt.CustomerRef?.name ?? null, pmt.TotalAmt, pmt.TxnDate,
       pmt.PaymentMethodRef?.name ?? null, linkedIds, JSON.stringify(pmt)]
    );
  }
  return payments.length;
}

async function syncDeposits(): Promise<number> {
  const deposits = await qboQuery<QBODeposit>(
    "SELECT * FROM Deposit MAXRESULTS 1000"
  );
  for (const dep of deposits) {
    await query(
      `INSERT INTO qbo_deposits (qbo_id, txn_date, total_amount, deposit_to_account, memo, line_details, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         txn_date = EXCLUDED.txn_date, total_amount = EXCLUDED.total_amount,
         deposit_to_account = EXCLUDED.deposit_to_account, memo = EXCLUDED.memo,
         line_details = EXCLUDED.line_details, raw_data = EXCLUDED.raw_data,
         last_synced_at = NOW()`,
      [dep.Id, dep.TxnDate, dep.TotalAmt,
       dep.DepositToAccountRef?.name ?? null,
       dep.PrivateNote ?? null,
       JSON.stringify(dep.Line ?? []),
       JSON.stringify(dep)]
    );
  }
  return deposits.length;
}

async function syncBills(): Promise<number> {
  const bills = await qboQuery<QBOBill>(
    "SELECT * FROM Bill MAXRESULTS 1000"
  );
  for (const bill of bills) {
    const status = bill.Balance === 0 ? "Paid" : "Open";
    await query(
      `INSERT INTO qbo_bills (qbo_id, doc_number, vendor_name, vendor_qbo_id, total_amount, balance, txn_date, due_date, status, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         doc_number = EXCLUDED.doc_number, vendor_name = EXCLUDED.vendor_name,
         vendor_qbo_id = EXCLUDED.vendor_qbo_id, total_amount = EXCLUDED.total_amount,
         balance = EXCLUDED.balance, txn_date = EXCLUDED.txn_date,
         due_date = EXCLUDED.due_date, status = EXCLUDED.status,
         raw_data = EXCLUDED.raw_data, last_synced_at = NOW()`,
      [bill.Id, bill.DocNumber ?? null, bill.VendorRef?.name ?? null,
       bill.VendorRef?.value ?? null, bill.TotalAmt, bill.Balance,
       bill.TxnDate, bill.DueDate ?? null, status, JSON.stringify(bill)]
    );
  }
  return bills.length;
}

async function syncPurchases(): Promise<number> {
  const purchases = await qboQuery<QBOPurchase>(
    "SELECT * FROM Purchase MAXRESULTS 1000"
  );
  for (const p of purchases) {
    await query(
      `INSERT INTO qbo_purchases (qbo_id, payment_type, txn_date, total_amount, account_name, vendor_name, memo, line_details, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         payment_type = EXCLUDED.payment_type, txn_date = EXCLUDED.txn_date,
         total_amount = EXCLUDED.total_amount, account_name = EXCLUDED.account_name,
         vendor_name = EXCLUDED.vendor_name, memo = EXCLUDED.memo,
         line_details = EXCLUDED.line_details, raw_data = EXCLUDED.raw_data,
         last_synced_at = NOW()`,
      [p.Id, p.PaymentType ?? null, p.TxnDate, p.TotalAmt,
       p.AccountRef?.name ?? null, p.EntityRef?.name ?? null,
       p.PrivateNote ?? null, JSON.stringify(p.Line ?? []),
       JSON.stringify(p)]
    );
  }
  return purchases.length;
}

async function syncVendors(): Promise<number> {
  const vendors = await qboQuery<QBOVendor>(
    "SELECT * FROM Vendor MAXRESULTS 1000"
  );
  for (const v of vendors) {
    await query(
      `INSERT INTO qbo_vendors (qbo_id, display_name, company_name, email, phone, balance, active, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         display_name = EXCLUDED.display_name, company_name = EXCLUDED.company_name,
         email = EXCLUDED.email, phone = EXCLUDED.phone, balance = EXCLUDED.balance,
         active = EXCLUDED.active, raw_data = EXCLUDED.raw_data, last_synced_at = NOW()`,
      [v.Id, v.DisplayName, v.CompanyName ?? null,
       v.PrimaryEmailAddr?.Address ?? null,
       v.PrimaryPhone?.FreeFormNumber ?? null,
       v.Balance, v.Active, JSON.stringify(v)]
    );
  }
  return vendors.length;
}

async function syncCreditMemos(): Promise<number> {
  const memos = await qboQuery<QBOCreditMemo>(
    "SELECT * FROM CreditMemo MAXRESULTS 1000"
  );
  for (const cm of memos) {
    await query(
      `INSERT INTO qbo_credit_memos (qbo_id, doc_number, customer_name, total_amount, balance, txn_date, memo, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         doc_number = EXCLUDED.doc_number, customer_name = EXCLUDED.customer_name,
         total_amount = EXCLUDED.total_amount, balance = EXCLUDED.balance,
         txn_date = EXCLUDED.txn_date, memo = EXCLUDED.memo,
         raw_data = EXCLUDED.raw_data, last_synced_at = NOW()`,
      [cm.Id, cm.DocNumber ?? null, cm.CustomerRef?.name ?? null,
       cm.TotalAmt, cm.RemainingCredit ?? 0, cm.TxnDate,
       cm.PrivateNote ?? null, JSON.stringify(cm)]
    );
  }
  return memos.length;
}

async function syncAccounts(): Promise<number> {
  const accounts = await qboQuery<QBOAccount>(
    "SELECT * FROM Account MAXRESULTS 1000"
  );
  for (const a of accounts) {
    await query(
      `INSERT INTO qbo_accounts (qbo_id, name, account_type, account_sub_type, current_balance, fully_qualified_name, active, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         name = EXCLUDED.name, account_type = EXCLUDED.account_type,
         account_sub_type = EXCLUDED.account_sub_type,
         current_balance = EXCLUDED.current_balance,
         fully_qualified_name = EXCLUDED.fully_qualified_name,
         active = EXCLUDED.active, raw_data = EXCLUDED.raw_data,
         last_synced_at = NOW()`,
      [a.Id, a.Name, a.AccountType, a.AccountSubType ?? null,
       a.CurrentBalance ?? null, a.FullyQualifiedName ?? null,
       a.Active, JSON.stringify(a)]
    );
  }
  return accounts.length;
}

async function syncEstimates(): Promise<number> {
  const estimates = await qboQuery<QBOEstimate>(
    "SELECT * FROM Estimate MAXRESULTS 1000"
  );
  for (const e of estimates) {
    await query(
      `INSERT INTO qbo_estimates (qbo_id, doc_number, customer_name, total_amount, txn_date, expiration_date, status, memo, raw_data, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (qbo_id) DO UPDATE SET
         doc_number = EXCLUDED.doc_number, customer_name = EXCLUDED.customer_name,
         total_amount = EXCLUDED.total_amount, txn_date = EXCLUDED.txn_date,
         expiration_date = EXCLUDED.expiration_date, status = EXCLUDED.status,
         memo = EXCLUDED.memo, raw_data = EXCLUDED.raw_data, last_synced_at = NOW()`,
      [e.Id, e.DocNumber ?? null, e.CustomerRef?.name ?? null,
       e.TotalAmt, e.TxnDate, e.ExpirationDate ?? null,
       e.TxnStatus ?? null, e.PrivateNote ?? null, JSON.stringify(e)]
    );
  }
  return estimates.length;
}

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

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST() {
  try {
    console.log("[QBO Sync] Starting full sync...");

    const result: SyncResult = {
      invoices: 0, payments: 0, deposits: 0, bills: 0,
      purchases: 0, vendors: 0, creditMemos: 0, accounts: 0,
      estimates: 0, pnlSnapshot: false,
    };

    // Run syncs sequentially to avoid QB API rate limits
    result.accounts = await syncAccounts();
    console.log(`[QBO Sync] ${result.accounts} accounts`);

    result.vendors = await syncVendors();
    console.log(`[QBO Sync] ${result.vendors} vendors`);

    result.invoices = await syncInvoices();
    console.log(`[QBO Sync] ${result.invoices} invoices`);

    result.payments = await syncPayments();
    console.log(`[QBO Sync] ${result.payments} payments`);

    result.deposits = await syncDeposits();
    console.log(`[QBO Sync] ${result.deposits} deposits`);

    result.bills = await syncBills();
    console.log(`[QBO Sync] ${result.bills} bills`);

    result.purchases = await syncPurchases();
    console.log(`[QBO Sync] ${result.purchases} purchases`);

    result.creditMemos = await syncCreditMemos();
    console.log(`[QBO Sync] ${result.creditMemos} credit memos`);

    result.estimates = await syncEstimates();
    console.log(`[QBO Sync] ${result.estimates} estimates`);

    result.pnlSnapshot = await syncPnlSnapshot();
    console.log(`[QBO Sync] P&L snapshot: ${result.pnlSnapshot ? "saved" : "skipped"}`);

    await updateLastSync();

    console.log("[QBO Sync] Full sync complete", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[QBO Sync] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
