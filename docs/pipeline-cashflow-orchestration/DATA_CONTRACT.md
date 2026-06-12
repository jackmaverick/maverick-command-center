# Pipeline Cashflow Data Contract

This page is allowed to make claims only when the source and caveat are clear.

## Current live API shape

Endpoint: `/api/financial/pipeline-cashflow`

Required top-level fields:

- `generatedAt`
- `cohortStart`
- `sourceNotes`
- `summary`
- `stageCounts`
- `arBySegment`
- `pipelineByStage`
- `timing`
- `conversionMatrix`
- `stuckMoney`

## Claims and required proof

### Expected cash

Claim: expected cash in 30/60/90 days.

Required proof:

- AR source from `invoices`.
- Sold/production pipeline source from `jobs` value fallback stack.
- Estimate pipeline separated from cash.
- Weighting rules visible in code or config.
- Forecast error measured later against actual payments/closures.

### AR total

Claim: outstanding receivables.

Required proof:

- active invoice rows only
- non-draft invoices only unless explicitly labeled
- due amount calculation documented
- source row drilldown available

### Sold pipeline

Claim: sold or production money not yet collected.

Required proof:

- status-to-cash-stage mapping
- value source per job
- excluded statuses listed
- Paid & Closed excluded from open pipeline

### Estimate pipeline

Claim: uncertain estimate opportunity.

Required proof:

- separate from AR and sold pipeline
- no spendable-cash language
- conversion probability based on matured cohorts once available

### Timing

Claim: median, p75, and p90 days between stages.

Required proof:

- `job_stage_history` transition rows
- sample count displayed
- cohort start displayed
- fallback source documented if activities/tasks are used

### Deal likelihood

Claim: this deal is getting closer or getting stale.

Required proof:

- explainable factors
- no black-box score alone
- stage age versus historical p75
- recent activity/task/estimate/invoice evidence
- backtest by segment when enough samples exist

## Source table priorities

Primary pipeline and workflow:

- `jobs`
- `job_stage_history`
- `estimates`
- `invoices`
- `payments`
- `work_orders`
- `tasks`
- `activities`

Secondary cash/accounting:

- `qbo_invoices`
- `qbo_payments`
- `qbo_deposits`
- `cashflow_actuals`
- `v_latest_cashflow_snapshot`

## Accuracy thresholds

Green:

- API returns 200.
- Required fields present.
- Freshness acceptable.
- Reconciliation variance under 1% and under $1,000 for major totals.
- No unmapped high-dollar statuses.

Yellow:

- API returns 200 but one source table is stale.
- Variance under 3% or under $5,000.
- Some unmapped statuses below materiality threshold.
- Forecast model stale but source totals reconcile.

Red:

- API or page fails.
- Fake zeroes shown on data failure.
- Variance over 3% or over $5,000.
- JobNimbus/Supabase freshness unknown.
- QBO/cash claims made while connection is expired.

## Required materiality rules

- Major total variance threshold: 1% or $1,000.
- High-dollar unmapped status threshold: any status bucket over $10,000.
- Stale table default: 24 hours for jobs/invoices/payments/estimates, 72 hours for activities/tasks unless changed by business rhythm.
- Forecast weight change needs sample size of at least 20 outcomes per segment/stage bucket or must be labeled experimental.

## Forbidden claims

- Do not call estimates cash.
- Do not call QBO disconnected data real-time.
- Do not claim 99% forecast accuracy without backtesting.
- Do not present material-only GP as full GP.
- Do not claim uptime from a local build.
- Do not hide failed data behind `$0`.
