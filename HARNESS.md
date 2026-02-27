# Code Factory Harness — Maverick Command Center

Agents write and review 100% of the code. This harness enforces deterministic, auditable standards.

## Flow

```
PR opened/pushed
    │
    ├─► risk-policy-gate (preflight)
    │     ├─ compute risk tier (high/low)
    │     ├─ assert docs drift rules
    │     └─ wait for Greptile review (if high tier)
    │
    ├─► CI Pipeline (waits for gate)
    │     ├─ typecheck
    │     ├─ lint
    │     ├─ build
    │     ├─ browser evidence (hits live Vercel app)
    │     └─ harness smoke
    │
    ├─► Greptile Code Review
    │     ├─ on push → greptile-rerun (SHA deduped)
    │     └─ on clean → auto-resolve bot-only threads
    │
    ├─► Remediation (manual trigger)
    │     └─ Claude Code fixes Greptile findings
    │
    └─► merge (only when all gates pass)
```

## Risk Tiers

**High risk** (requires Greptile review):
- `src/app/api/**` — all API endpoints
- `src/lib/db.ts`, `src/lib/sync.ts`, `src/lib/jobnimbus.ts` — data layer
- `src/lib/constants.ts` — status mappings (affect all calculations)
- `drizzle/**` — database migrations
- `harness/**`, `.github/workflows/**` — control plane

**Low risk**: everything else (UI components, pages, styles)

## Commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run harness:risk-tier` | Show risk tier for current changes |
| `npm run harness:policy-gate` | Run full policy gate locally |
| `npm run harness:smoke` | Run smoke tests |
| `npm run harness:ui:pre-pr` | Capture + verify browser evidence |
| `npm run harness:weekly-metrics` | Weekly metrics report |

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `risk-policy-gate.yml` | PR open/sync | Preflight gate |
| `ci.yml` | PR open/sync | Build/test/lint/evidence |
| `greptile-rerun.yml` | PR synchronize | SHA-deduped rerun requests |
| `greptile-auto-resolve-threads.yml` | Check run complete | Resolve bot-only threads |
| `remediation.yml` | Manual (workflow_dispatch) | Claude Code fixes findings |

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | Supabase connection for build |
| `ANTHROPIC_API_KEY` | Claude Code remediation agent |
