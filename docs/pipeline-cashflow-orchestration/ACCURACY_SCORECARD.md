# Accuracy Scorecard

Use this to grade whether `/financial/pipeline-cashflow` is trustworthy.

## Daily score

Total: 100 points.

### 1. Availability, 20 points

- 10 points: page returns 200.
- 5 points: API returns 200.
- 5 points: latency acceptable and page hydrates real data.

Red flag: any fake zero on API failure is an automatic fail.

### 2. Freshness, 20 points

- 5 points: jobs fresh.
- 5 points: invoices/payments fresh.
- 5 points: estimates/work_orders fresh.
- 5 points: job_stage_history/tasks/activities fresh enough for workflow timing.

### 3. Reconciliation, 25 points

- 5 points: AR total reconciles.
- 5 points: weighted AR reconciles.
- 5 points: sold pipeline reconciles.
- 5 points: estimate pipeline reconciles.
- 5 points: status and segment buckets reconcile.

### 4. Classification, 15 points

- 5 points: no high-dollar unmapped statuses.
- 5 points: segment logic matches shared segment helper.
- 5 points: ambiguous jobs are listed for review.

### 5. Forecast honesty, 10 points

- 5 points: confidence/sample counts visible.
- 5 points: forecast error is being captured or explicitly marked not yet calibrated.

### 6. Actionability, 10 points

- 5 points: stuck-money list has JobNimbus links and dollar impact.
- 5 points: next actions are clear enough for Jack, Brent, or the rep to act.

## Grade bands

- 95 to 100: trust it for daily operating decisions.
- 85 to 94: useful, but review warnings before acting.
- 70 to 84: directional only.
- Below 70: do not use for cash decisions until fixed.

## Weekly calibration report

Every week, produce:

- last week's expected 7-day and 30-day cash
- actual collected/closed cash
- variance by segment
- variance by stage
- biggest misses
- whether the model was wrong or the source data was stale
- recommended weight changes, if sample count supports it

## Accuracy language for Jack

Use this language:

- "Source accuracy": do the numbers match JobNimbus/Supabase rows?
- "Forecast accuracy": did the expected cash actually arrive later?
- "Uptime": did the page/API stay available?

Do not mix those into one magic score. Magic scores are where accountability goes to die.
