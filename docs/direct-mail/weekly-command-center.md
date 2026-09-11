# Direct Mail weekly Command Center

`/direct-mail` combines the latest reviewed aggregate analytics with the preexisting mailing-proof view. Results are not recomputed from partial legacy campaign tables. The weekly operator reconciles Gmail, vendor invoices, JobNimbus, AIMS and hail evidence, then publishes one validated snapshot to Supabase.

## Refresh contract

- `GET /api/direct-mail/weekly` reads the latest `direct_mail_weekly_reviews` row, ordered by evidence date then generation/publication time, and validates the entire public schema.
- Refresh reloads a published review. It does not launch collection. A review older than seven Chicago calendar days is prominently marked stale.
- All archived real leads belong in history. Tests and deleted/duplicate records remain excluded. Approved invoices, collected cash and gross profit are separate measures.
- Monthly invoices are grouped by lead creation month; vendor expenses by service month; vendor payments by paid date. Those differing bases must not be divided into monthly ROAS.
- Requested, planned and confirmed-mailed quantities remain distinct. ROI and mailed counts stay null when unsupported.
- Actions are proposed review decisions, not send-ready recipients or live workflow status. Expanding approval checks does not mark them complete. No unauthenticated write endpoint, CRM mutation, payment or mailhouse send exists.
- The weekly payload excludes names, street addresses, recipient files and raw messages. The authorized job-profit extension adds only reviewed job IDs, lead months and single-list linkage. A separate read-only endpoint returns the requested job names and financial breakdowns from the current cost ledger. Source Gmail links still require mailbox access. Never publish raw baseline JSON as an API response or static asset.

## Publish a reviewed snapshot

Input must conform to `src/lib/direct-mail/weekly.ts`. See the durable weekly task procedure at `/Users/maverick_ai/Documents/Loops/reports/direct-mail-weekly/OPERATING.md`. Prepare fresh `dashboard-actions.json` and `dashboard-gaps.json` from each review, then use its `build_dashboard_payload.py` aggregate projection.

Load DATABASE_URL from the existing ignored production environment file; never put secrets in commands or Git. Validate first:

```
npx tsx scripts/publish-direct-mail-weekly.ts /absolute/path/dashboard-payload.json
```

For the initial installation only, add `--migrate` to the publish command; migration is additive and keeps browser roles denied. Publish subsequent runs with:

```
npx tsx scripts/publish-direct-mail-weekly.ts /absolute/path/dashboard-payload.json --apply
```

The operator validates sums, unique IDs, source URLs and allowed fields before any write; hashes the canonical aggregate payload; inserts once per hash; and reads it back. It writes a local `.publication.json` receipt. Repeated identical runs cannot duplicate data. Source manifests are retained locally; only their hash is stored. There is no need to deploy code for a new weekly report.

After publishing, fetch the production API and match its ID, asOf and totals against the local receipt, then inspect the visible page. If the database schema or validation fails, the page shows unavailable, never synthetic data. A newer failed collection must leave the last valid publication intact and be reported by the weekly operator. Do not silently refresh timestamps on old evidence.

## Validation and recovery

Run direct-mail Vitest suites, targeted ESLint and `npm run build`. In the isolated browser, check all tabs, search/filter results, monthly selector, approval-check disclosure, CSV export and narrow viewport. Confirm the original `/api/direct-mail` remains available.

Snapshots are immutable. For a correction, publish a newly reviewed payload with the same evidence date and a later generatedAt. Never delete historic evidence to hide a failed calculation. Roll back app code through the previous Vercel deployment if needed; the additive snapshot table does not change legacy ledgers.

## Invoice-based planning

Received Ron invoices are committed vendor costs regardless of payment timing. `pricing.ts` calculates the weighted planning rate as total invoice dollars divided by total physical invoiced pieces; all invoices are the default, with a latest-invoice comparison. It includes invoice fees, tax and discounts and never counts a repeated printing/labor quantity as another mailing. Missing or zero piece counts prevent a rate. Additional USPS costs outside the invoices are not included.

Budget planner supports a quick estimate, per-action what-if quantities and cost sorting. What-if quantities are temporary UI state, not saved orders. Next sends shows the default weighted projection next to proposed counts. The monthly default displays invoice costs, pieces and unit cost; payment timing is optional. Cash evidence remains distinct: unpaid/unverified invoices use null paidDate and paymentEvidence, and only records with both contribute to knownPaid. No accounting/payment state or mailing approval is changed by a budget estimate.

## Job profit and list drill-down

Jack authorized job-level names, links and gross-profit analysis on September 11. Optional `jobLinks` pins the financial cohort to reviewed real Direct Mail jobs and a single earlier list when unambiguous. Do not assign multi-list matches, count the same job twice, or confuse a lead with an invoiced job. The builder emits links from all reviewed jobs, including archived outcomes. Old reviews remain readable without links.

`GET /api/direct-mail/profit?id=<review hash>` accepts only a validated review ID, looks up those job IDs server-side, and returns a narrow current financial projection. It uses `v_job_final_gp` and `v_job_total_costs`: invoice revenue, recorded costs (materials, finalized labor, subcontractors, retail, permits), blockers and cost status. Missing rows remain unknown. Reconciled profit requires invoice readiness, no blockers, and complete costs. Revenue with unfinished costs is provisional even when `final_gross_profit` exists in the source view. No company overhead or mail costs are part of job gross profit.

List drill-down deducts a clearly labeled estimated mailing cost once per list, based on requested rows times the weighted invoice rate. This is not an actual vendor allocation, causal attribution, or final ROI. The channel summary separately deducts received Ron invoice totals and calls out missing extra USPS/bills. Monthly views distinguish lead month, matched mailing request month, and first observed completed/closeout stage from status history. Observed completion is not verified accounting recognition; current lifetime job GP must never be called profit booked that month. Completion/lead monthly service costs are shown alongside without subtraction; only modeled mailing-cohort comparisons subtract estimated mailing costs.

Job profit refresh is read-only against the synced ledger, independent of the weekly attribution snapshot. The main Refresh results button invalidates both. Export preserves individual jobs, negative profits, readiness reasons, source links and month basis. No new payment, customer message, or CRM write is authorized. Validate profit tests, endpoint tests, existing weekly suites, ESLint and build; verify named Carriage Crossing jobs, provisional blockers, filters and monthly grouping live.
