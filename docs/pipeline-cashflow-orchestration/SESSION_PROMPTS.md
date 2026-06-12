# Session Prompts

Copy these into separate Hermes, Scout, or coding sessions. Each prompt is scoped so the agent does not wander off and try to solve capitalism before lunch.

## Prompt 1: Uptime Sentinel

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to build or design a health monitor for `https://maverick-command-center.vercel.app/financial/pipeline-cashflow` and `/api/financial/pipeline-cashflow`.

Read `docs/pipeline-cashflow-orchestration/README.md`, `ORCHESTRATOR.md`, `GOALS.md`, and `DATA_CONTRACT.md` first.

Deliver:

1. Current live health check results.
2. Proposed or implemented health endpoint/script.
3. Required JSON shape checks.
4. Freshness checks available today.
5. Verification output.

Do not change production behavior unless the change is docs-only or explicitly approved. If coding, use a clean branch or worktree. Do not expose secrets.

## Prompt 2: Reconciliation Auditor

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to prove whether the live Pipeline Cashflow API totals reconcile to raw Supabase rows.

Read `docs/pipeline-cashflow-orchestration/DATA_CONTRACT.md` and `GOALS.md` Goal 2 first. Inspect `src/app/api/financial/pipeline-cashflow/route.ts`.

Deliver:

1. Recomputed AR total.
2. Recomputed weighted AR.
3. Recomputed sold pipeline.
4. Recomputed estimate pipeline.
5. API total vs recomputed total variance.
6. Source-row samples and exclusion counts.
7. Recommendation: green/yellow/red.

If you implement tooling, prefer a read-only script or endpoint. No JobNimbus writes. No fake numbers.

## Prompt 3: Data Freshness Sentinel

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to determine whether Pipeline Cashflow data is fresh enough to trust.

Read `docs/pipeline-cashflow-orchestration/GOALS.md` Goal 3 and `RUNBOOK.md`.

Check freshness for:

- jobs
- invoices
- payments
- estimates
- work_orders
- job_stage_history
- tasks
- activities
- sync logs if available

Deliver:

1. Latest timestamp by source.
2. Fresh/stale status by source.
3. Whether stale data likely means sync failure or normal quiet period.
4. Recommended UI/API freshness card shape.
5. Any code/report created and verification output.

## Prompt 4: Segment and Stage Classifier

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to audit whether Pipeline Cashflow correctly classifies every active job by segment and cash stage.

Read `docs/pipeline-cashflow-orchestration/AGENT_ROSTER.md`, `DATA_CONTRACT.md`, and inspect `src/lib/segment.ts` plus `src/app/api/financial/pipeline-cashflow/route.ts`.

Deliver:

1. Status-to-stage map currently used.
2. Active statuses not clearly mapped.
3. Dollar value sitting in `other` or ambiguous buckets.
4. Segment counts and dollars.
5. Jobs that need human review.
6. Proposed mapping changes, but do not patch code unless asked.

## Prompt 5: Deal Likelihood Agent

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to design the read-only deal likelihood scoring model for Pipeline Cashflow.

Read `docs/pipeline-cashflow-orchestration/GOALS.md` Goal 5 and `AGENT_ROSTER.md` Deal Likelihood Agent.

Use these signals if available:

- current job status and segment
- days in current status
- job_stage_history movement
- tasks due/completed
- estimate date/status/signature
- invoice date/status/due/paid
- recent activities
- work_orders schedule/production state
- source and sales rep history

Deliver:

1. Scoring rubric from 0 to 100.
2. Required data fields.
3. SQL/API response shape.
4. Top positive and negative factor examples.
5. Backtesting plan.
6. First implementation goal that is safe and read-only.

Do not use an opaque LLM score as the source of truth. Explainable rules first, optional AI narrative later.

## Prompt 6: Forecast Calibration Agent

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to create the plan or first implementation for measuring whether Pipeline Cashflow forecasts come true.

Read `docs/pipeline-cashflow-orchestration/GOALS.md` Goal 6 and `ACCURACY_SCORECARD.md`.

Deliver:

1. Snapshot schema or storage strategy.
2. Daily forecast capture fields.
3. Actual cash comparison fields.
4. Error metrics by segment/stage/rep.
5. Weekly report format.
6. Rules for when weights can be changed.

No weight changes unless sample count supports them.

## Prompt 7: Stuck Money Closer

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to turn Pipeline Cashflow into a daily action list.

Read `docs/pipeline-cashflow-orchestration/GOALS.md` Goal 7 and inspect the current `stuckMoney` API output.

Deliver:

1. Top stuck-money categories.
2. Next-action classification rules.
3. Owner/rep assignment logic.
4. JobNimbus link format.
5. UI section proposal for Top 10 Today.
6. Read-only implementation plan or code if approved.

The goal is not to shame the team with a giant list. The goal is to tell them the ten moves that change cash fastest.

## Prompt 8: Cash Reality Agent

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to compare Pipeline Cashflow forecasts to actual cash/accounting sources.

Read `docs/pipeline-cashflow-orchestration/GOALS.md` Goal 8 and load the Maverick gross-profit/cashflow source-of-truth skill if available.

Check:

- `/api/financial/cashflow`
- QBO connection status if available
- qbo invoice/payment tables if available
- cashflow_actuals or latest cashflow snapshots
- JobNimbus AR variance from QBO if QBO is connected

Deliver:

1. Current cash reality status.
2. What is JobNimbus forecast vs what is QBO/bank reality.
3. Any expired/disconnected caveats.
4. Recommended reconciliation UI card.
5. Verification output.

## Prompt 9: UI Truth Agent

You are working in `/Users/maverick_ai/maverick-command-center`. Your goal is to QA the Pipeline Cashflow page for Jack and Brent usability.

Read `docs/pipeline-cashflow-orchestration/DATA_CONTRACT.md`, `RUNBOOK.md`, and inspect `src/app/financial/pipeline-cashflow/page.tsx`.

Deliver:

1. What the page answers well.
2. What could mislead Jack or Brent.
3. Missing caveats or drilldowns.
4. Mobile and browser QA notes.
5. Proposed UI changes.
6. Verification output if changes are made.

No fake polish. If the data is uncertain, the UI should say so plainly.

## Prompt 10: Integration Orchestrator

You are Hermes coordinating the Pipeline Cashflow work. Read every file in `docs/pipeline-cashflow-orchestration/`.

Your job:

1. Review findings from all specialist agents.
2. Reject unverified claims.
3. Merge compatible recommendations into a prioritized build plan.
4. Identify file conflicts and deployment risks.
5. Decide the next 1 to 3 goals to execute.
6. Report to Jack in plain English.

Output format:

- Current status: green/yellow/red
- Accepted findings:
- Rejected or unproven findings:
- Next goals:
- Build/deploy recommendation:
- What Jack should care about:
