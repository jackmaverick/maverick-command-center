# Direct Mail weekly Command Center

`/direct-mail` combines the latest reviewed aggregate analytics with the preexisting mailing-proof view. Results are not recomputed from partial legacy campaign tables. The weekly operator reconciles Gmail, vendor invoices, JobNimbus, AIMS and hail evidence, then publishes one validated snapshot to Supabase.

## Refresh contract

- `GET /api/direct-mail/weekly` reads the latest `direct_mail_weekly_reviews` row, ordered by evidence date then generation/publication time, and validates the entire public schema.
- Refresh reloads a published review. It does not launch collection. A review older than seven Chicago calendar days is prominently marked stale.
- All archived real leads belong in history. Tests and deleted/duplicate records remain excluded. Approved invoices, collected cash and gross profit are separate measures.
- Monthly invoices are grouped by lead creation month; vendor expenses by service month; vendor payments by paid date. Those differing bases must not be divided into monthly ROAS.
- Requested, planned and confirmed-mailed quantities remain distinct. ROI and mailed counts stay null when unsupported.
- Actions are proposed review decisions, not send-ready recipients or live workflow status. Expanding approval checks does not mark them complete. No unauthenticated write endpoint, CRM mutation, payment or mailhouse send exists.
- Public aggregate payload excludes names, street addresses, job identifiers, recipient files and raw messages. Source Gmail links still require mailbox access. Never publish raw baseline JSON as an API response or static asset.

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
