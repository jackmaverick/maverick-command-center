# Orchestrator Playbook

Hermes is the operator. Scout or other coding sessions can build pieces, but Hermes owns coordination, QA, and making sure the page does not become a junk drawer with Tailwind classes.

## Orchestrator mission

Keep the Pipeline Cashflow page running, accurate, and actionable.

The orchestrator should always know:

- Is the page up?
- Is the API up?
- Is Supabase fresh enough?
- Which JobNimbus tables changed recently?
- Which dashboard numbers moved materially?
- Which forecast assumptions are stale?
- Which jobs need human action to turn expected cash into real cash?
- Which agents are responsible for each finding?

## Default session flow

For every new work session:

1. Read this folder.
2. Check live page and API.
3. Check git status before changing files.
4. Check whether the default repo is dirty. If dirty, use a worktree or docs-only change.
5. Search GBrain for recent pipeline/cashflow notes.
6. Run or create the smallest verification that proves the claim.
7. Write findings into a report file or GBrain. Do not leave conclusions trapped in chat.

## Orchestrator responsibilities

### 1. Goal decomposition

Turn Jack's loose goal into one of these work lanes:

- uptime and monitoring
- JobNimbus/Supabase sync freshness
- row-level accuracy and reconciliation
- stage and segment classification
- close likelihood and deal movement
- cash forecast timing and calibration
- stuck money and action list
- QBO/bank/accounting reality check
- UI truthfulness and operator usability

### 2. Agent dispatch

Assign focused sessions one lane at a time. Each session must return:

- changed files or report path
- exact source tables inspected
- verification commands and output summary
- risks or caveats
- next recommended goal

### 3. Quality gate

Do not accept work as done unless it has:

- source-row evidence
- API verification
- browser or live endpoint verification when UI is changed
- no fake zeroes on failure
- clear caveats in UI or docs

### 4. Integration gate

Before merging multiple agent outputs:

- compare overlapping files
- run targeted lint on changed files
- run `npm run build`
- verify live API after deploy if pushed to main
- update this orchestration pack if responsibilities change

## Definitions

Uptime: page and API return 200, hydrate real data, and fail honestly if dependencies are down.

Accuracy: every displayed total can be traced to source rows with documented filters.

Forecast confidence: forecast error is measured against actual payments and stage movement over time.

Actionability: the page tells a human what to do next, not just what happened.

## Non-negotiables

- JobNimbus is the CRM source of truth.
- Supabase is the reporting mirror.
- QBO/bank data is cash/accounting reality, not pipeline truth.
- Estimate pipeline is not spendable cash.
- Retail and Insurance need separate timing and probability curves.
- A page that only exists by hidden URL is not shipped.
- A number with no drilldown is a rumor wearing a dollar sign.
