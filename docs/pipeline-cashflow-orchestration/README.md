# Pipeline Cashflow Orchestration Pack

Purpose: turn `/financial/pipeline-cashflow` into a 24/7 operating system for Maverick cash, not a pretty chart that lies with confidence.

Live page: https://maverick-command-center.vercel.app/financial/pipeline-cashflow
Live API: https://maverick-command-center.vercel.app/api/financial/pipeline-cashflow
Repo: `/Users/maverick_ai/maverick-command-center`
Primary source of truth: JobNimbus, mirrored into Supabase project `biewckagexvxrehccaoo`

## North-star target

This page should be:

1. 99% available as a web page and API.
2. 99% explainably accurate against JobNimbus/Supabase for the fields it claims to report.
3. Honest about forecast confidence, data gaps, and stale syncs.
4. Useful every morning for Jack and Brent to decide what money is real, what money is probable, and what needs human action.

Important distinction: 99% accuracy does not mean the forecast is always correct. Forecasting humans, insurance, supplements, and homeowners is not physics. It means the dashboard can explain every number, reconcile source rows, and measure forecast error over time.

## Files in this pack

- `ORCHESTRATOR.md`: how Hermes should coordinate other sessions.
- `GOALS.md`: milestone roadmap and acceptance tests.
- `AGENT_ROSTER.md`: the monitoring and analysis agents Jack needs.
- `DATA_CONTRACT.md`: what the page is allowed to claim and what it must prove.
- `SESSION_PROMPTS.md`: copy/paste prompts for other sessions or agents.
- `RUNBOOK.md`: daily, weekly, and incident workflows.
- `ACCURACY_SCORECARD.md`: how to grade accuracy, confidence, and uptime.

## Recommended first move

Start with Goal 1 and Goal 2 in `GOALS.md`:

1. Build a monitoring endpoint that reports page/API health, data freshness, row counts, and forecast confidence.
2. Build a reconciliation report comparing the dashboard numbers to raw JobNimbus/Supabase source rows.

Without those two, every other feature is just dashboard cosplay. Expensive cosplay, because it has charts.
