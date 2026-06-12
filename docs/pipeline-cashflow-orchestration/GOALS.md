# Pipeline Cashflow Goals

These are the goals to hand to separate agents or sessions. Do them in order unless Jack has a fire.

## Goal 1: Health and uptime monitor

Build a read-only health endpoint and monitor for `/financial/pipeline-cashflow`.

Acceptance tests:

- Live page returns 200.
- Live API returns 200 JSON.
- API payload has generatedAt within expected freshness window.
- Payload includes required keys: summary, arBySegment, pipelineByStage, timing, conversionMatrix, stuckMoney, sourceNotes.
- Monitor records latency and status.
- Monitor alerts only when broken, stale, or materially degraded.

Target output:

- `/api/financial/pipeline-cashflow/health` or a script in `scripts/`.
- A short runbook entry for how to check it.

## Goal 2: Row-level reconciliation report

Prove the dashboard totals match raw Supabase rows.

Acceptance tests:

- Recompute AR total and weighted AR from `invoices`.
- Recompute sold pipeline from `jobs` using the same stage and value logic.
- Recompute estimate pipeline separately.
- List included and excluded row counts.
- Show top 20 source rows behind each major total.
- Produce variance percentages between API and recomputed totals.
- Flag if variance exceeds 1% or $1,000, whichever is stricter.

Target output:

- `/api/financial/pipeline-cashflow/reconciliation` or `scripts/reconcile-pipeline-cashflow.ts`.
- UI link later, but script/API first.

## Goal 3: Data freshness and JobNimbus sync sentinel

Show whether the dashboard is looking at fresh JobNimbus data or yesterday's leftovers.

Acceptance tests:

- Report most recent update timestamps for jobs, invoices, estimates, payments, work_orders, job_stage_history, tasks, activities.
- Report latest sync logs if available.
- Flag stale tables by severity.
- Distinguish no new business activity from failed sync.
- Show the freshness status on the page.

Target output:

- Data freshness card in the page.
- Health endpoint includes freshness by table.

## Goal 4: Segment and stage classifier audit

Make sure Retail, Insurance, Repairs, Real Estate, Warranty, and Other are classified consistently.

Acceptance tests:

- List all active statuses mapped to cash stages.
- List all unmapped or `other` statuses with dollar value.
- Validate segment logic against `src/lib/segment.ts`.
- Show counts and dollars by segment and stage.
- Create a review queue for ambiguous jobs.

Target output:

- Classification audit report.
- Suggested code changes only after audit.

## Goal 5: Deal likelihood agent

Estimate whether open deals are getting closer to closing or going stale.

Acceptance tests:

- Score jobs from 0 to 100 based on stage, age, recent activity, estimate sent/signed state, tasks, notes/activity recency, record type, rep, and historical conversion rate.
- Split likelihood by Retail, Insurance, Repairs.
- Explain top positive and negative factors per job.
- Never overwrite JobNimbus. Read-only first.
- Backtest score buckets against actual Sold/Paid outcomes when enough history exists.

Target output:

- `dealLikelihood` array in the API or separate endpoint.
- Top 10 closer actions on the page.

## Goal 6: Forecast calibration agent

Measure whether the 30/60/90 forecast was right after time passes.

Acceptance tests:

- Store daily forecast snapshots.
- Compare prior expected cash against actual payments/invoice closures.
- Track error by segment, stage, rep, and confidence bucket.
- Recommend weight changes only when sample count is meaningful.
- Display model confidence and last calibration date.

Target output:

- Snapshot table or JSON file strategy.
- Weekly calibration report.

## Goal 7: Stuck-money closer agent

Turn the page into an action list.

Acceptance tests:

- Identify jobs over p75 stage age.
- Sort by expected cash impact and days over threshold.
- Include exact next action category: collect payment, send final invoice, schedule production, follow up estimate, resolve supplement, clean missing data.
- Link every job to JobNimbus.
- Group by owner or rep when possible.

Target output:

- Top 10 Today section.
- Optional Slack digest later, with Jack approval.

## Goal 8: Cash reality agent

Compare pipeline forecast to actual cash and accounting systems.

Acceptance tests:

- Compare JobNimbus AR to QBO invoices if QBO is connected.
- Compare payment timing to QBO/bank/cashflow actuals when available.
- Show variance between projected cash and actual collections.
- Label disconnected or expired QBO status honestly.

Target output:

- Cash reality card and reconciliation notes.

## Goal 9: Operator UI truth pass

Make the page readable for Jack and Brent.

Acceptance tests:

- No fake zeroes.
- Every major card has source notes or drilldown.
- Estimate pipeline is visually separate from AR and sold pipeline.
- Confidence status is clear.
- Mobile layout is usable.
- Page answers: what cash is real, what cash is likely, what is stuck, what should we do today?

Target output:

- UI changes with browser verification.

## Goal 10: 24/7 operating loop

Combine health, reconciliation, freshness, calibration, and action generation into a continuous system.

Acceptance tests:

- Hourly health check.
- Daily reconciliation report.
- Weekly forecast calibration.
- Silent success, alert on failure or significant variance.
- All incidents logged with cause and fix.

Target output:

- Cron jobs or Vercel Cron routes.
- Runbook and incident log pattern.
