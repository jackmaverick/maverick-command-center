# Loop Health Cockpit

The Loop Health Cockpit is Jack's daily read-only proof board for Maverick automations and AI-agent loops.

Open `/loop-health` in the Command Center and read it from top to bottom:

1. Start with `Failing` and `Warning` counts.
2. Open each failing loop card and read `Last proof` plus `Next action`.
3. Treat `Unknown` as "not instrumented enough yet", not as healthy.
4. For approval-gated loops, approve from the source workflow only after checking the proof trail.
5. Use the registry table when deciding which repo or artifact to inspect next.

The cockpit has three evidence layers:

- Business proof: structured or artifact-backed loop snapshots in `loop_health_snapshots`.
- Runtime graph: current launchd, Hermes, crontab, and OpenClaw state from the watchdog's `loop_health` table.
- Local fallback: check local files, recent generated artifacts, and git worktree status when no snapshot exists.

A scheduler exit code does not prove the business outcome. A fresh business snapshot does not hide a current scheduler failure. The dashboard evaluates both sides:

- `healthy`: fresh business proof and no failing required runtime.
- `failing`: a current required runtime or fresh structured business result is failing.
- `stale`: the old result may have been green or red, but it is too old to describe current operation.
- `paused`: all required schedulers are intentionally paused.
- `unknown`: the loop has no authoritative current proof.
- `warning`: the loop is running but needs human attention or only weak artifact evidence exists.

Customer-facing and system mutations remain approval-gated. The cockpit and publisher do not send texts, send emails, mutate JobNimbus, or mutate OpenPhone. The publisher writes only loop-health metadata to Supabase.

## API

`GET /api/loop-health`

Returns:

- `generatedAt`
- `mode: live-health` when at least one Supabase snapshot is present, otherwise `read-only`
- `dataSources`
- summary counts for `healthy`, `warning`, `failing`, `stale`, `paused`, and `unknown`
- one row per registered loop with owner, source path, last run, last proof, status, next action, approval requirement, and proof details
- `actionSurface`, which tells Jack where the human team actually works the loop

The route returns `207` when at least one loop is failing or stale so dashboards can distinguish "the API loaded" from "every loop is currently proven".

Use `GET /api/loop-health?localOnly=1` for collector jobs that need fresh local proof without re-reading previously published snapshots.

## Live Snapshot Setup

Apply the loop-health tables with the existing Command Center database URL:

```bash
npm run loop-health:migrate
```

Publish current local proof into Supabase:

```bash
npm run loop-health:publish
```

The graph publisher writes one row per generic loop into `loop_health_snapshots`. It intentionally skips `production-communication-closed-loop` and `gaf_measurements_to_jobnimbus`, which have dedicated structured collectors. The production Vercel cockpit reads the latest row per loop, so Vercel never needs direct access to `/Users/maverick_ai/...` proof files.

Install the recurring 30-minute local graph publisher:

```bash
npm run loop-health:install-publisher
```

The publisher reads the local proof files, writes only loop-health metadata, and does not send customer messages or mutate JobNimbus/OpenPhone.

## Snapshot Tables

`loop_health_snapshots` stores the latest-run heartbeat history:

- `loop_id`
- `status`
- `ran_at`
- `checked_at`
- `proof_label`
- `proof_path`
- `proof_summary`
- `proof_evidence`
- `last_proof`
- `next_action`
- `approval_required`
- `source_repo_path`
- `source_repo`
- `source_branch`
- `health_source`
- `details`

`loop_health_lessons` is reserved for durable loop lessons:

- what happened
- what proof established it
- what changed
- what the loop should do next time
- whether Jack approval is still required

## Making A Loop Healthy

For a loop such as `Homeowner production texts`:

1. Open the loop card and copy the Codex starter prompt.
2. Work in the source project shown on the card, not in Command Center.
3. Verify the latest runner/audit/proof artifacts.
4. Fix or unblock the loop without sending live customer messages unless Jack explicitly approves.
5. Run the local Command Center and publish a fresh snapshot with `npm run loop-health:publish`.
6. Refresh the production cockpit and confirm the loop says `Live snapshot`.

## Production Communication Closed Loop

`production-communication-closed-loop` monitors the automatic material-delivery/install-date homeowner workflow.

- The reply graph polls every 15 minutes.
- Replies are linked to the communicated schedule for 24 hours, then monitoring ages out.
- A fresh successful heartbeat with no open cases is `healthy`.
- An unresolved homeowner scheduling reply is `warning` and routes to Chester/Mia in Daily Touch and Slack.
- A case older than 24 hours, a runtime failure, or a heartbeat older than two hours is `failing`.
- The production cockpit snapshot publisher runs every 15 minutes. If it stops, snapshot freshness independently downgrades the card.
- The card's Codex starter prompt points to the runner, heartbeat, launchd logs, and safe dry-run recovery sequence.

## GAF Measurements to JobNimbus Contract

The owning runner publishes two independent records:

- `loop_health`: `source=runner`, `loop_name=gaf_measurements_to_jobnimbus`, plus current runtime status, detail, and timestamps.
- `loop_health_snapshots`: `loop_id=gaf_measurements_to_jobnimbus`, the business-result status, `ran_at`, `checked_at`, proof references, and the JSON fields below in `details`.

```json
{
  "contract_version": "gaf_measurements_to_jobnimbus.v1",
  "outcome": "applied_verified",
  "source_provenance": "verified_attached_report",
  "run_id": "stable audit identifier",
  "verification": {
    "method": "authenticated_jobnimbus_browser_readback",
    "readback_at": "ISO-8601 timestamp"
  },
  "counts": {
    "discovered": 0,
    "eligible": 0,
    "applied_verified": 0,
    "nothing_to_change_verified": 0,
    "blocked_source": 0,
    "blocked_conflict": 0,
    "browser_failed": 0,
    "writes": 0,
    "verified_readbacks": 0
  }
}
```

`outcome` is `applied_verified`, `nothing_to_change_verified`, `blocked`, or `failed`. Healthy requires a fresh daily snapshot and either positive `applied_verified` with `applied_verified = writes = verified_readbacks`, or positive `nothing_to_change_verified` with zero writes. A deployed skill, queue scan, or browser acceptance without readback remains unknown rather than healthy.

## Registry

The durable registry lives in `src/lib/loop-registry.ts`.

Each loop records:

- name
- business promise
- owner
- source repo/path
- action surface for the human work queue or investigation surface
- last-run proof source
- last-proof source
- status rules
- next action
- approval requirement

When a real source is unavailable, the cockpit labels the loop `unknown` rather than filling in fake proof.

## Business Graph and Simplification

`src/lib/loop-graph.ts` maps every registered loop to a business family, stage, runtime dependencies, upstream loop dependencies, freshness policy, and simplification recommendation.

The current target structure is:

- Production communication: one graph with materials/install, team-update, and supervised-message lanes.
- Daily operations: one stuck-work capability feeding the shared Daily Touch action surface.
- Sales / estimate prep: one graph where verified GAF entry feeds prep, confirmation, reminders, replies, and no-shows.
- Job closeout and cash: one graph for supplier intake, matching, ledger, warranty, invoicing, and collections.
- Growth and reputation: one Website Growth graph plus one Reputation graph; retire duplicate paused ClickFlow schedules after verification.
- Pre-production readiness: one graph with permit and product-selection branches.
- Learning and repo hygiene: move to Agent & Infrastructure Health rather than counting them as customer/revenue loops.

## Action Surfaces

The cockpit is the health board, not the work queue. Each loop now declares where the work actually happens.

Common surfaces:

- `Michelle Daily Touch List`: team-facing task queue with `Approve`, `Deny`, `Wrong`, and `Done`.
- `Ops automation Codex session`: investigation/repair surface for automation code and dry-run proof.
- `Website Growth worktree`: SEO/indexing/content work surface.
- `Command Center cockpit worktree`: cockpit registry, UI, and health plumbing.

For loops such as `Gutter invoice reconciliation loop`, the intended flow is:

1. Cockpit shows health, last proof, and next action.
2. Michelle/team works the generated tasks in the Daily Touch List.
3. The ops loop refreshes proof and publishes a new health snapshot.
4. Cockpit reports whether the task surface is fresh and healthy.

For the `Invoice due-date alignment closed loop`, there is deliberately no Daily Touch task surface. The twice-daily runner publishes a structured snapshot after its update-and-readback cycle, while the runtime watchdog independently reports whether `com.maverick.invoice-due-date-loop` is loaded and succeeding. The cockpit shows the result as current for 20 hours; missed or unpublished runs age to `stale` instead of leaving an old green result on screen.

## Indexing Loop

The `Website indexing loop` is the crawl/indexability guardrail for website growth work.

It watches:

- the latest `daily-growth` SEO report in `/Users/maverick_ai/website/docs/seo-reports`
- the latest `technical-checks` JSON in `/Users/maverick_ai/website/docs/seo-reports/data`
- the clean website growth worktree at `/Users/maverick_ai/worktrees/website-growth-loop`

Use it before approving ClickFlow, SEO, or website-content tasks. If the loop is stale, failing, or unknown, rerun the technical indexing checks before creating more content.

## Discovery Pass

The cockpit registry now includes loops discovered from local automation memory, SecondBrain/vault notes, and `supabase-maverick-exteriors` report artifacts.

Added discovery-backed loops:

- `Google reviews loop`
- `Appointment prep loop`
- `Permit/Mia readiness loop`
- `Shingle color/material sync loop`
- `Richards/Billtrust invoice ingestion loop`
- `Manufacturer warranty loop`
- `Invoice/material ledger health loop`
- `Weekly AI learning loop`

Discovery rule: add a loop only when there is either a real proof artifact to read or an explicit missing-proof condition worth showing as `unknown`, `warning`, or `failing`. Do not mark a discovered script as healthy just because the script exists.

## Codex Project Routing

Every loop card includes a `Codex project` block so failed loops can be worked from a clean folder.

Default routing:

- Command Center / cockpit work: `/Users/maverick_ai/worktrees/loop-health-cockpit`
- Website growth and indexing work: `/Users/maverick_ai/worktrees/website-growth-loop`
- Operations automation loops: `/Users/maverick_ai/worktrees/ops-automation-loop-fixes`
- Invoice due-date alignment: `/Users/maverick_ai/runners/invoice-due-dates/supabase-maverick-exteriors` on `main`

When opening a Codex task from a failing loop, create or select the project that points at the folder shown on that loop card, then paste the generated starter prompt. The prompt tells the agent to confirm folder, remote, branch, dirty count, proof path, and safety boundaries before editing.
