# Daily bank balance → cash-flow sheet — setup

**Shipped 2026-06-14** (commit `e96cdc7`). Code is live and deployed but **no-ops until the 4 one-time steps below are done.**

## What it does

A daily Vercel cron (`/api/qbo/sheet-sync`, 7:10am CT) reads the operating bank balance from QuickBooks (via the `qbo_accounts` mirror, which the every-15-min QBO sync keeps fresh) and writes it into the cash-flow workbook (`1iQyts1T...`):

1. **Appends a dated row** to a `Daily Bank Balance` tab (auto-created on first run): `Date | Account | Balance | Synced At`. This is the trend you asked for.
2. **Optionally overwrites the live "Current Cash in Bank" cell** so the whole forecast recomputes — but only once you set `CASHFLOW_CASH_CELL` (off by default, so we don't clobber the wrong cell in Brent's model).

Right now QuickBooks shows **Commerce Checking - 5079 = $463,757.95**, while the sheet's manual cell still says $197,500. Once wired up, that gap closes itself every morning.

## One-time setup (only you can do steps 1-3)

### 1. Create a Google service account
- Google Cloud Console → IAM & Admin → Service Accounts → Create.
- Name it e.g. `cashflow-sheet-writer`. No roles needed.
- Keys → Add key → JSON → download. You'll use two fields from it: `client_email` and `private_key`.
- Enable the **Google Sheets API** for the project (APIs & Services → Library → Google Sheets API → Enable).

### 2. Share the sheet with the service account
- Open the cash-flow sheet → Share → paste the service account's `client_email` → give it **Editor** → Send (uncheck "notify").

### 3. Set Vercel env vars (Production)
Project `maverick-command-center` → Settings → Environment Variables:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = the `client_email`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` = the `private_key` (paste the whole PEM, `\n`s and all — the code normalizes them)
- (optional) `CASHFLOW_CASH_CELL` = e.g. `AVAILABLE TO SPEND!B5` — only set this once you confirm the exact tab name + cell of "Current Cash in Bank", to turn on the live-cell overwrite.

Defaults already baked in (override only if needed): `CASHFLOW_SHEET_ID`, `CASHFLOW_HISTORY_TAB` (= `Daily Bank Balance`).

### 4. Verify
Redeploy (or wait for the next push), then:
```bash
curl https://maverick-command-center.vercel.app/api/qbo/sheet-sync
```
- Before setup: `{"skipped":true,"reason":"Google service-account env vars not set..."}`
- After setup: `{"success":true,"balance":463757.95,"historyTab":"Daily Bank Balance",...}` and a new dated row in the sheet.

## Notes / caveats
- The balance is QuickBooks' **book balance** for the account — only as live as the QBO bank feed + reconciliation. It is not a direct pull from Commerce Bank.
- "Operating account" is auto-selected as the `Bank`-type account with the largest balance (currently Commerce Checking - 5079). Hardcode via a future env var if that ever changes.
- The live-cell overwrite is deliberately opt-in. Confirm the exact cell before enabling — a wrong cell write lands in Brent's live forecast.
- This is RC-2 from the cash-flow investigation (the sheet was a manual island). The history-row half is done; full sheet reconciliation (Option A/B) is still a Jack+Brent decision.
