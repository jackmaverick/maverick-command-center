# Implementation Status

Built in branch `feat/pipeline-cashflow-reliability`.

## Shipped in this pass

### Reliability monitor on the page

The live `/financial/pipeline-cashflow` page now has a `Reliability Monitor` section with:

- overall status
- freshness status and worst source age
- reconciliation variance
- material unmapped status count
- plain-English near-instant accuracy caveat

### New API endpoints

- `/api/financial/pipeline-cashflow/health`
  - combines API shape, freshness, reconciliation, and classification checks
  - returns `200` for green/yellow and `503` for red

- `/api/financial/pipeline-cashflow/freshness`
  - checks latest source/sync freshness for jobs, invoices, payments, estimates, work_orders, job_stage_history, tasks, activities, and sync_log
  - sync_log is advisory only because the legacy table is not the real source of freshness

- `/api/financial/pipeline-cashflow/reconciliation`
  - recomputes AR total, weighted AR, sold pipeline, estimate context, and 30/60/90 expected cash from raw Supabase rows
  - compares recomputed values to the normal API payload
  - returns source-row samples for AR, post-sold pipeline, and estimate context

### Classification improvement

Mapped high-dollar Insurance/post-sold statuses into cash stages:

- `Future Work` → sold
- `Deductible Invoice Sent` → approval
- `Deductible Collected` → approval
- `Pre Production Supplementing` → approval
- `Waiting on Supplements` → approval
- `Insurance Pending/Cont Skipped` → approval
- `Project Review In Progress` → approval
- `Back End Job Audit` → invoice

This removed material unmapped statuses from the health check during local verification.

## Verification

Local verification against production Supabase env:

- targeted ESLint passed
- `npm run build` passed
- `/api/financial/pipeline-cashflow/freshness` returned `200 green`
- `/api/financial/pipeline-cashflow/reconciliation` returned `200 green`, max variance `$0`
- `/api/financial/pipeline-cashflow/health` returned `200 green`
- browser QA showed `MONITOR GREEN`, `6.2h worst source`, `$0` reconciliation variance, and `0 material unmapped`

## Current instant-accuracy reality

The dashboard now reads live from Supabase every API request and detects stale data immediately.

The remaining bottleneck is not the page. It is the JobNimbus → Supabase mirror. True near-instant accuracy requires real incremental sync or JobNimbus webhooks for jobs, estimates, invoices, payments, work orders, activities, and stage history.
