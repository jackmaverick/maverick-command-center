# QBO Production Setup — Remaining Tasks

**Status:** Waiting on Intuit production key approval (submitted Feb 27, 2026)
**Expected approval:** 1-3 business days

## Completed

- [x] Phase 1: Database schema (qbo_connection, qbo_invoices, qbo_payments, invoice_mapping tables)
- [x] Phase 1: QBO client library (`src/lib/quickbooks.ts`) — OAuth, encryption, auto-refresh, query/report helpers
- [x] Phase 1: OAuth API routes (authorize, callback, disconnect, status, sync)
- [x] Phase 1: Settings page — QBO connect/disconnect/sync controls
- [x] Phase 1: Sidebar — FINANCIAL nav group (P&L, Cash Flow, Reconciliation)
- [x] Phase 1: Security — RLS on all QBO tables, CSRF protection, AES-256-GCM token encryption
- [x] Phase 2: P&L tab — KPI cards, monthly trend chart, YoY comparison, expense categories
- [x] Phase 3: Cash Flow tab — collection probability model, 3 scenarios, forecast chart
- [x] Phase 4: Reconciliation tab — 4-tier matching engine, JN↔QBO comparison
- [x] Phase 4: Matching engine (`src/lib/reconciliation.ts`)
- [x] Intuit developer questionnaire completed
- [x] Code pushed to Vercel (commit 592e7de)

## After Intuit Approval

- [ ] **Get production Client ID and Secret** from Intuit developer dashboard
- [ ] **Add redirect URI in Intuit dashboard:** `https://maverick-command-center.vercel.app/api/qbo/callback`
- [ ] **Add env vars to Vercel** (Settings → Environment Variables):
  - `QBO_CLIENT_ID` = production Client ID
  - `QBO_CLIENT_SECRET` = production Client Secret
  - `QBO_REDIRECT_URI` = `https://maverick-command-center.vercel.app/api/qbo/callback`
  - `QBO_ENCRYPTION_KEY` = `e6f6124d04b84561645c16cade2b4adff5ebb1d5bfe50a43da4bc5376e1d6f06`
  - `QBO_ENVIRONMENT` = `production`
- [ ] **Redeploy on Vercel** (trigger from dashboard or `git push`)
- [ ] **Connect real QuickBooks** from Settings page on live site
- [ ] **Verify P&L data** matches QuickBooks for same period
- [ ] **Run sync** and verify invoices/payments pulled correctly
- [ ] **Update `.env.local`** with production keys for local dev

## Future Enhancements

- [ ] **Vercel Cron for auto-sync** — set up 15-min or daily cron to keep QBO data fresh
- [ ] **QBO Webhooks** — real-time sync when invoices/payments change in QuickBooks
- [ ] **Capture `intuit_tid` header** — for QBO support troubleshooting (noted in questionnaire)
- [ ] **Cash flow model tuning** — refine collection probability weights with historical data after 30 days
- [ ] **Reconciliation manual actions** — approve/flag matches from the UI (API exists, UI buttons need wiring)
- [ ] **Refresh token expiry warning** — email/Slack alert when QBO refresh token < 14 days from expiry
