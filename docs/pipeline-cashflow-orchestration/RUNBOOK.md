# Pipeline Cashflow Runbook

## Daily 5-minute check

1. Open live page:
   - https://maverick-command-center.vercel.app/financial/pipeline-cashflow
2. Check live API:
   - https://maverick-command-center.vercel.app/api/financial/pipeline-cashflow
3. Confirm:
   - page loads
   - API returns 200
   - generatedAt is recent
   - summary values are not zero because of an error
   - stuck-money list has JobNimbus links
4. If anything fails, run the incident workflow below.

## Daily cash meeting questions

Ask the page:

1. What cash is already real AR?
2. What sold/production cash is likely in 30/60/90 days?
3. What estimate pipeline is promising but not spendable?
4. What jobs are stuck past normal timing?
5. Who owns the next action?
6. Which source data is stale or missing?

If the page cannot answer these, create a goal from `GOALS.md`.

## Weekly calibration workflow

1. Pull prior snapshot forecast.
2. Pull actual payments/invoice closures.
3. Compare expected vs actual by segment and stage.
4. Identify biggest misses.
5. Decide whether the model was wrong or the humans/data changed.
6. Update forecast weights only with enough samples.
7. Write report to GBrain or repo docs.

## Incident workflow

### API returns 500

1. Check Vercel logs.
2. Curl the API directly.
3. Inspect recent code changes to `src/app/api/financial/pipeline-cashflow/route.ts`.
4. Check database connectivity.
5. Check SQL type casts around invoice status, dates, and null handling.
6. Fix, build, deploy, verify live.

### Page loads but shows bad numbers

1. Run reconciliation.
2. Compare API totals to source rows.
3. Check recent JobNimbus/Supabase sync status.
4. Check segment and stage mapping for new statuses.
5. Patch source logic or mapping.
6. Add a data note if the caveat is real, not a bug.

### Data stale

1. Check sync logs.
2. Confirm whether JobNimbus had actual changes.
3. Check webhooks/cron if they exist.
4. Run manual sync only if approved and safe.
5. Log the stale source and duration.

### Forecast missed badly

1. Do not immediately change weights.
2. Check whether source data was stale.
3. Check whether one whale job distorted the bucket.
4. Check whether segment was misclassified.
5. Check whether insurance timing was treated like retail.
6. If still wrong, add to weekly calibration report.

## Deployment verification

For code changes:

```bash
npx eslint <changed files>
npm run build
curl -fsS https://maverick-command-center.vercel.app/api/financial/pipeline-cashflow
```

Browser-check the exact page if UI changed.

## Reporting format

Use this:

- Status: green/yellow/red
- What changed or failed:
- Evidence:
- Impact:
- Fix or next action:
- Owner:
