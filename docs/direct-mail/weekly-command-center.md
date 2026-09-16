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

The source operator publishes on weekdays at 8 a.m. and 2 p.m. America/Chicago. The page loads the latest publication when opened, checks every five minutes while open, and checks again after reconnect or window focus. The button is a manual retry only. The weekly endpoint examines the five newest publications and may show the newest valid one with a warning if a newer stored payload is invalid. The independent mailing-proof view renders as the failure fallback.

Production builds are accepted only when Vercel reports `VERCEL_GIT_COMMIT_REF=main`. Feature branches remain preview deployments. This prevents a production CLI deployment from one feature branch from replacing unrelated, newer Command Center pages.

## Validation and recovery

Run direct-mail Vitest suites, targeted ESLint and `npm run build`. In the isolated browser, check all tabs, search/filter results, monthly selector, approval-check disclosure, CSV export and narrow viewport. Confirm the original `/api/direct-mail` remains available.

Snapshots are immutable. For a correction, publish a newly reviewed payload with the same evidence date and a later generatedAt. Never delete historic evidence to hide a failed calculation. Roll back app code through the previous Vercel deployment if needed; the additive snapshot table does not change legacy ledgers.

## Invoice-based planning

Received Ron invoices are committed vendor costs regardless of payment timing. `pricing.ts` calculates the weighted planning rate as total invoice dollars divided by total physical invoiced pieces; all invoices are the default, with a latest-invoice comparison. It includes invoice fees, tax and discounts and never counts a repeated printing/labor quantity as another mailing. Missing or zero piece counts prevent a rate. Additional USPS costs outside the invoices are not included.

Budget planner supports a quick estimate, per-action what-if quantities, cost sorting and a monthly campaign-mix scenario. The mix compares editable large-audience drops with automated neighborhood runs, total campaign workload and the historical average batch count needed to reach the same volume. It uses the invoice-based and all-in planning rates for cost estimates. What-if quantities are temporary UI state, not saved orders. Next sends shows the default weighted projection next to proposed counts. The monthly default displays invoice costs, pieces and unit cost; payment timing is optional. Cash evidence remains distinct: unpaid/unverified invoices use null paidDate and paymentEvidence, and only records with both contribute to knownPaid. No accounting/payment state or mailing approval is changed by a budget estimate.

The Overview growth target shows both cost bases. A monthly dollar target is converted separately with the weighted Ron invoice rate and the postage-inclusive planning rate, and the 40,000–50,000-piece goal shows its corresponding all-in range. This prevents the service-only budget from being presented as the complete cash requirement.

Reviewed campaign evidence now carries two independent controlled fields: audience strategy (`job_scheduled_neighborhood`, `general_audience`, `other`) and touch (`first_touch`, `resend`, `mixed`). Missing legacy values remain `unclassified`; the UI never derives them from a list name, date or size. Overview compares campaign count, requested volume, linked leads, invoiced revenue, documented mailing cost and revenue ROAS by audience strategy. It reports linked leads and revenue per 1,000 requested rows while confirmed-mail denominators are incomplete, so these are directional comparison signals rather than response rates or causal proof. List performance exposes both labels and its CSV export preserves them.

When both scheduled-neighborhood and general-audience history exists, Overview turns that directional comparison into an operating cue. It recommends automating the smaller scheduled-neighborhood runs only when they lead on both linked leads per 1,000 requested rows and revenue ROAS; general drops remain the volume lane. A mixed signal keeps both lanes in the plan without naming a winner. The budget planner uses the same reviewed classification coverage and continues to model workload and cost without creating mailings.

## Job profit and list drill-down

Jack authorized job-level names, links and gross-profit analysis on September 11. Optional `jobLinks` pins the financial cohort to reviewed real Direct Mail jobs and a single earlier list when unambiguous. Do not assign multi-list matches, count the same job twice, or confuse a lead with an invoiced job. The builder emits links from all reviewed jobs, including archived outcomes. Old reviews remain readable without links.

`GET /api/direct-mail/profit?id=<review hash>` accepts only a validated review ID, looks up those job IDs server-side, and returns a narrow current financial projection. It uses `v_job_final_gp` and `v_job_total_costs`: invoice revenue, recorded costs (materials, finalized labor, subcontractors, retail, permits), blockers and cost status. Missing rows remain unknown. Reconciled profit requires Job Close Out or Paid & Closed, invoice readiness, no blockers, complete costs, and no reviewed job-cost holds. A new cost or hold makes it provisional again. Revenue with unfinished costs is provisional even when `final_gross_profit` exists in the source view. No company overhead or mail costs are part of job gross profit.

The Overview shows lifetime channel-return cards from this same live job-profit response, the reviewed mailing-cost allocations and the reviewed customer-cash snapshot. Revenue ROAS is invoiced revenue divided by documented mailing cost. Gross profit per $1 of mail spend is job gross profit to date divided by documented mailing cost; it does not subtract the mailing cost itself. Applied cash stays separate from unapplied receipts, and applied cash per $1 of mail spend is a cumulative comparison rather than a matched-month return because payment timing differs from mailing timing. The cards show incomplete mailing-cost coverage, reconciled/provisional job counts and cash-review limitations so partial expenses, unfinished closeout or unverified bank settlement cannot appear final.

Lead & mailing momentum shows leads, requested rows, package count, average request size and the strongest available physical-piece evidence for each month. A complete confirmed-mailed count wins; otherwise the view uses vendor invoice pieces by service month, then postal-statement pieces mapped to request month, and finally Pending. These sources measure production or mailing evidence, not USPS delivery. The visible 40,000–50,000 monthly-piece and $25,000 monthly-spend targets are the September 16 growth-planning scenario for $1 million in additional revenue; they are planning benchmarks, not approved spend or a forecast.

List drill-down uses optional `costReview` invoice allocations plus recovered postal charges; the legacy requested-row model is only a fallback for older reviews. Exact list amounts and shared allocations are labeled separately. Every received invoice must reconcile to allocated cents; every campaign occurs once; corrected postal statements cannot repeat. Add net postage if stamps are already invoiced, full postage if outside the invoice, and leave unresolved overlaps partial. Unknown components stay pending. Postal charges are not evidence of postal cash payment or delivery.

Mailing costs provides list/source drill-down, monthly filtering, sorting and CSV export. Budget planner keeps the invoice-only weighted rate and adds a total planning estimate that removes invoiced stamps before adding full postage from the latest observed request-month statements. This is not a vendor quote.

`cashReview` contains a verified timestamp, per-job applied/unapplied totals and payment-month totals, which must reconcile. It is a reviewed snapshot and is not refreshed by the live job-cost button. No raw payment objects, addresses or email bodies are exposed. `jobCostHolds` prevents a known reviewed discrepancy from being treated as reconciled until the next reviewer resolves it from current evidence.

Monthly profit distinguishes lead month, mailing request month and observed completion. Matched mailing cohorts compare their current lifetime outcomes to documented campaign costs. Channel and cohort ROAS/profit ROI remain qualified as provisional, with incomplete coverage visible. Never divide lead-month revenue by service-month expenses and call it matched-cohort ROI, or call current lifetime job GP accounting profit booked that month.

Job profit refresh is read-only against the synced ledger, independent of the weekly attribution snapshot. The main Refresh results button invalidates both. Export preserves individual jobs, negative profits, readiness reasons, source links and month basis. No new payment, customer message, or CRM write is authorized. Validate profit tests, endpoint tests, existing weekly suites, ESLint and build; verify named Carriage Crossing jobs, provisional blockers, filters and monthly grouping live.
