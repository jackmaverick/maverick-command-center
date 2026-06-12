# Agent Roster

This is the agent team for the Pipeline Cashflow page.

## 1. Uptime Sentinel

Question it answers: is the page alive right now?

Monitors:

- `/financial/pipeline-cashflow`
- `/api/financial/pipeline-cashflow`
- latency
- JSON shape
- hydration/page text if browser QA is available

Output:

- green/yellow/red status
- last checked time
- error and probable cause

## 2. Data Freshness Sentinel

Question it answers: is this JobNimbus data fresh enough to trust?

Monitors:

- jobs
- invoices
- payments
- estimates
- work_orders
- job_stage_history
- tasks
- activities
- sync_log or equivalent sync status

Output:

- freshness by table
- stale table warnings
- likely sync break vs normal quiet period

## 3. Reconciliation Auditor

Question it answers: do the displayed totals match the source rows?

Checks:

- AR total
- weighted AR
- sold pipeline value
- estimate pipeline value
- status bucket totals
- segment totals
- stuck-money rows

Output:

- API total vs recomputed total
- variance
- source-row samples
- inclusion/exclusion counts

## 4. Segment and Stage Classifier

Question it answers: are jobs in the right buckets?

Checks:

- record_type_name
- Real Estate override
- Warranty/Repairs/Retail/Insurance logic
- unmapped statuses
- cash-stage mapping
- segment drift over time

Output:

- ambiguous jobs
- unmapped statuses with dollars
- recommended mapping changes

## 5. Deal Likelihood Agent

Question it answers: which deals are actually getting closer to cash?

Signals:

- current stage
- days in stage
- recent activity
- estimate status and date signed
- task due dates and completion
- invoice status
- work order schedule
- rep/source history
- segment-specific close rate

Output:

- score 0 to 100
- top positive factors
- top risk factors
- next best action

## 6. Forecast Calibration Agent

Question it answers: did our forecast come true?

Checks:

- prior 30/60/90 forecast snapshots
- actual payments or invoice closures
- forecast error by segment/stage/rep
- whether weights need adjustment

Output:

- forecast error report
- recommended weight changes with sample counts

## 7. Stuck Money Closer

Question it answers: what should humans do today to turn expected cash into real cash?

Finds:

- overdue AR
- stale Estimate Sent
- Sold jobs not scheduled
- production jobs missing invoice
- invoice sent with no payment
- insurance supplement bottlenecks
- missing owner/rep/data fields

Output:

- top 10 action list
- owner/rep if known
- JobNimbus link
- dollar impact

## 8. Cash Reality Agent

Question it answers: does forecasted cash line up with QBO/bank/accounting reality?

Checks:

- QBO connection status
- QBO invoices/payments where available
- cashflow actuals
- current cash and burn from `/financial/cashflow`
- variance between expected and actual collections

Output:

- cash reality notes
- QBO/JobNimbus variance
- accounting caveats

## 9. UI Truth Agent

Question it answers: can Jack and Brent actually use the page without being misled?

Checks:

- labels
- data notes
- no fake zeroes
- mobile layout
- visible drilldowns
- entry points from financial pages
- whether uncertain money is separated from real AR

Output:

- UX punch list
- screenshots or browser verification notes

## 10. Integration Orchestrator

Question it answers: what gets built next, by whom, and what counts as done?

Owns:

- goal sequencing
- prompt dispatch
- code review
- build/lint/live verification
- GBrain logging
- final summary to Jack

Output:

- one prioritized next-goal list
- accepted/rejected agent findings
- deployment recommendation
