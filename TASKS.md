# Maverick Command Center — Open Tasks

Last updated: February 28, 2026

---

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
