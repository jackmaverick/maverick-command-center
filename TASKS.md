# Maverick Command Center — Open Tasks

Last updated: April 20, 2026

---

## 🚨 Urgent — Prod issues

- [ ] **Vercel DB auth broken** — `https://maverick-command-center.vercel.app/api/qbo/status` returns `password authentication failed for user "postgres"`. Vercel `DATABASE_URL` env var is stale relative to Supabase. Fix: Supabase dashboard → Settings → Database → copy connection string → paste into Vercel → redeploy.
- [ ] **Intuit production key: 7 weeks overdue** — Submitted Feb 27, 2026 for "1-3 business day" SLA. Now 52 days late. Chase Intuit developer support, escalate if needed. Until resolved, the cash flow page works on seeded data but can't show live QBO actuals.

## Cash Flow Monitor — v1 shipped April 20 (PR #4)

**Completed on branch `feat/cashflow-editable-expenses`:**
- ✅ Migration 002: `app_recurring_expenses`, `app_one_time_expenses`, `app_forecast_overrides` — seeded with 14 AI-derived rows from P&L Apr25-Mar26 (latest-3-month avg, post-payroll-transition, post-QBO-consolidation). Total fixed overhead $57k/mo. Safety floor $330k.
- ✅ CRUD API routes under `/api/financial/expenses/{recurring,one-time}` + `/[id]` — zod-validated, non-destructive (end_date retires rows, never deletes)
- ✅ Forecast engine blends editable expenses, computes `availableToSpend` (conservative) and `availableToSpendWithPipeline` (aggressive) alongside existing scenarios
- ✅ Available-to-Spend hero KPI card (the decision number: cash − 4wk committed − safety floor)
- ✅ RecurringExpensesEditor — inline amount edit, end-date, add rows, confidence pills
- ✅ OneTimeExpensesEditor — planned one-off spend with date picker
- ✅ PlanVsActualTable — trailing 3 months planned vs QBO actual (gracefully degrades when QBO not connected)
- ✅ CSV export — single file for accountant review with all recurring + one-time rows

**Follow-ups for next session:**
- [ ] **Review all 14 AI-seeded rows with Brent (accountant)** — every row has `source='ai_seeded'` + confidence level + notes field for derivation. Low-confidence rows especially need review: Advertising ($4,870, highly variable), Variable/Discretionary Overhead ($1,500, estimate), Communication Services ($436, only 2 months data).
- [ ] **Split "Employee Wages (aggregate)" into per-person rows** once hires stabilize, so individual end-dating works when someone leaves.
- [ ] **Add annual Insurance renewal row** — base Insurance ($965/mo) + a ~$6.6k/year annual row for the renewal spike.
- [ ] **Quarterly review of Interest paid (seller financing)** — will decrease as principal is paid to uncle.
- [ ] **Replace CSV export with full Google Sheets integration** — needs `googleapis` package + OAuth flow. Push amounts both ways, auto-refresh Sheet on DB change. ~2-3 hrs.
- [ ] **Phase 2: Ingest Bob's 2024 rough P&L** — extends forecast history from 12 → 24 months, better seasonal confidence.
- [ ] **Phase 2: Revenue breakdown by salesperson** — Bob Blake legacy book vs new Maverick team, per-rep trends, blended forecast.
- [ ] **Phase 2: 4th scenario that includes Sold stage-weighted pipeline** — currently MVP is conservative (AR + In-progress only).

## Bugs & Data Fixes

- [ ] **Lead count discrepancy** — Dashboard shows ~56 leads vs ~29 expected. Cold Lead status has 38 jobs + Dead has 3. User is archiving Cold/Dead in JobNimbus; needs re-sync to reflect corrected count.
- [ ] **Warranty segment not routable** — `/segments/warranty` returns 404. The page's `SLUG_TO_SEGMENT` mapping and the `/api/segments` `VALID_SEGMENTS` array both omit `warranty`, even though it's defined in `lib/constants.ts`. Need to add it to both.
- [ ] **Job Types page is a stub** — `/job-types` shows all placeholder values (`---`, `$---`). No API endpoint exists. Needs a `/api/job-types` route and real data.
- [ ] **lead-sources `topSources` type mismatch** — API returns `closeRate`/`totalLeads` fields but page interface expects `value`. Low priority since `topSources` is never rendered, but the TypeScript types are wrong.

## Speed-to-Lead Accuracy

- [ ] **Option 1 — OpenPhone contact exclusion (quick win)**
  - Add `is_excluded BOOLEAN DEFAULT false` to `contacts` table in Supabase
  - Add UI in Command Center Settings page to flag spam/junk contacts
  - Update `/api/speed-to-lead` queries: `AND c.contact_jnid NOT IN (SELECT jnid FROM contacts WHERE is_excluded = true)`
  - Backfill: review existing contacts and flag known spam/vendors/wrong numbers
- [ ] **Option 2 — GHL conversation data (long-term)**
  - Finish GHL sync integration (webhook handler + sync scripts already scaffolded in `supabase-maverick-exteriors/scripts/`)
  - Pull GHL contact statuses (active/DND/spam/lost) into Supabase
  - Use GHL pipeline stage to only measure contacts actually in sales funnel
  - Replace or supplement OpenPhone data with GHL conversation attribution

## Revenue Verification

- [ ] **QuickBooks API integration** — Pull actual invoices/payments from QuickBooks Online and cross-reference against JN/Supabase revenue numbers. Show reconciliation view or "verified" badge. (Another terminal is working on this.)

## Sync & Infrastructure

- [ ] **Sync engine is a scaffold** — `POST /api/sync` calls `runFullSync()` but it only logs to `sync_log`. The `jobnimbus.ts` API client is written but not wired into the sync engine. Need to implement actual JN → Supabase data pull.
- [ ] **Vercel Cron for auto-sync** — Set up 15-minute cron job to keep Supabase in sync with JobNimbus automatically.
- [ ] **CI/CD pipeline** — Branch protection had 5 required checks (Typecheck, Lint, Build, risk-policy-gate, harness-smoke) with no GitHub Actions workflow to run them. Protection was removed to unblock merges. Consider adding a proper `.github/workflows/ci.yml`.
- [ ] **`/api/sync` GET creates its own DB pool** — Minor: uses `new Pool(...)` directly instead of the singleton from `db.ts`. Should use the shared pool.

## Dashboard Enhancements

- [ ] **Per-rep revenue on Sales page** — Revenue is now calculated but `avgCycleDays` is still hardcoded to `0` (requires `job_stage_history` tracking to compute properly).
- [ ] **Sales page follow-up metrics** — `followUpMetrics` and `timeBetweenStatuses` return empty arrays. Need to query JN activities (notes, calls, emails) to populate these.
- [ ] **Mobile responsive polish** — Full pass across all 9 pages.
- [ ] **Lighthouse performance audit** — Optimize bundle size, image loading, and client-side data fetching.

## Future Features (Phase 11)

- [ ] Real-time webhooks from JobNimbus
- [ ] Forecasting models
- [ ] Custom report builder
- [ ] Export to Excel/PDF
- [ ] Slack integration
