# Loop Health Cockpit

The Loop Health Cockpit is Jack's daily read-only proof board for Maverick automations and AI-agent loops.

Open `/loop-health` in the Command Center and read it from top to bottom:

1. Start with `Failing` and `Warning` counts.
2. Open each failing loop card and read `Last proof` plus `Next action`.
3. Treat `Unknown` as "not instrumented enough yet", not as healthy.
4. For approval-gated loops, approve from the source workflow only after checking the proof trail.
5. Use the registry table when deciding which repo or artifact to inspect next.

The cockpit has two layers:

- Live health: read loop snapshots from Supabase when available.
- Local fallback: check local files, recent generated artifacts, and git worktree status when no snapshot exists.

Customer-facing and system mutations remain approval-gated. The cockpit and publisher do not send texts, send emails, mutate JobNimbus, or mutate OpenPhone. The publisher writes only loop-health metadata to Supabase.

## API

`GET /api/loop-health`

Returns:

- `generatedAt`
- `mode: live-health` when at least one Supabase snapshot is present, otherwise `read-only`
- `dataSources`
- summary counts for `healthy`, `warning`, `failing`, and `unknown`
- one row per registered loop with owner, source path, last run, last proof, status, next action, approval requirement, and proof details

The route returns `207` when at least one loop is failing so dashboards can distinguish "the API loaded" from "every loop is fine".

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

By default the publisher reads:

```text
http://localhost:3000/api/loop-health?localOnly=1
```

To publish from a different local Command Center URL:

```bash
npm run loop-health:publish -- --source=http://localhost:3001/api/loop-health?localOnly=1
```

The publisher writes one row per loop into `loop_health_snapshots`. The production Vercel cockpit reads the latest row per loop, so Vercel no longer needs direct access to `/Users/maverick_ai/...` proof files.

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

## Registry

The durable registry lives in `src/lib/loop-registry.ts`.

Each loop records:

- name
- business promise
- owner
- source repo/path
- last-run proof source
- last-proof source
- status rules
- next action
- approval requirement

When a real source is unavailable, the cockpit labels the loop `unknown` rather than filling in fake proof.

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

When opening a Codex task from a failing loop, create or select the project that points at the folder shown on that loop card, then paste the generated starter prompt. The prompt tells the agent to confirm folder, remote, branch, dirty count, proof path, and safety boundaries before editing.
