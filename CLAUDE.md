# Maverick Command Center - Project Guide

**Status:** 🟢 Live on Vercel  
**URL:** https://maverick-command-center.vercel.app  
**GitHub:** https://github.com/jackmaverick/maverick-command-center  
**Database:** Supabase project `biewckagexvxrehccaoo`

## Overview

The Maverick Command Center is a unified Sales & Ops dashboard consolidating:
- **Growth Dashboard** - Metrics, pipeline, revenue
- **Command Center** - Task management, agents, activity
- **JobNimbus Dashboard** - CRM views, job tracking

It's a real-time operational dashboard for roofing/exterior services showing pipeline, revenue, performance by segment/rep, and lead response times.

## Architecture

### Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4, dark theme
- **Charts:** Recharts 3
- **Data:** React Query 5 (client-side caching)
- **Database:** Supabase PostgreSQL (biewckagexvxrehccaoo)
- **Hosting:** Vercel (auto-deploy on git push)

### Data Flow
```
JobNimbus (source) → Supabase (mirror) → Next.js API → React Dashboard
```

- JobNimbus is the source of truth for all CRM data
- Supabase syncs via `/api/sync` endpoint
- All revenue metrics use accrual basis (invoice creation date)
- Segment classification: Real Estate = cf_string_29 '🔑', else by record_type_name

## Deployment

### Current Status
- ✅ All 9 pages deployed to Vercel
- ✅ All 8 API endpoints operational
- ✅ Database connection configured
- ✅ Auto-deploy on git push enabled

### Live Pages
- `/` - Dashboard home (KPIs, funnel, activity)
- `/pipeline` - Stage visualization
- `/segments/[segment]` - Real Estate, Retail, Insurance, Repairs
- `/sales` - Rep performance
- `/speed-to-lead` - Response times
- `/lead-sources` - Source analysis
- `/weekly-review` - Historical trends
- `/agents` - Agent status monitoring
- `/settings` - Integration docs

### Live API Endpoints
- `GET/POST /api/sync` - JobNimbus sync
- `GET/POST /api/recovery` - Full data recovery
- `GET /api/dashboard` - Home KPIs
- `GET /api/pipeline` - Stage funnel
- `GET /api/sales` - Rep metrics
- `GET /api/segments` - Segment data (requires ?segment param)
- `GET /api/speed-to-lead` - Response times
- `GET /api/lead-sources` - Source performance
- `GET /api/snapshots` - Historical snapshots
- `GET /api/agents` - Agent status

## Development

### Local Setup
```bash
cd ~/maverick-exteriors/Github\ Repos/maverick-command-center
npm install
npm run dev  # Runs on http://localhost:3007
```

### Environment Variables
```bash
# Required (get from Supabase project settings)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.biewckagexvxrehccaoo.supabase.co:5432/postgres

# Optional (for sync/recovery)
JOBNIMBUS_API_KEY=xxx
ADMIN_RECOVERY_KEY=xxx
```

### Build & Deploy
```bash
npm run build          # Local test build
git push origin main   # Auto-deploys to Vercel
```

## Data & Sync

### Current Lead Count Issue
- **Dashboard shows:** 56 jobs in Lead stage
- **Actual active leads:** ~29 (after Cold/Dead archiving)
- **Discrepancy:** Cold Lead status has 38 jobs
- **Resolution:** User is archiving Cold/Dead jobs in JobNimbus

### Sync Endpoints
**Manual Sync:**
```bash
curl -X POST https://maverick-command-center.vercel.app/api/sync
```

**Check Sync Status:**
```bash
curl https://maverick-command-center.vercel.app/api/sync
```

**Full Recovery (requires admin key):**
```bash
curl -X POST https://maverick-command-center.vercel.app/api/recovery \
  -H "Authorization: Bearer $ADMIN_RECOVERY_KEY"
```

### Sync Architecture
- Incremental sync via date-based cursors
- Placeholder: JobNimbus API client created but needs full implementation
- Logging: All syncs logged to `sync_log` table
- Recovery: Clears sync cursors for full re-sync

## Database Schema

### Key Tables
- `jobs` - Job data from JobNimbus
- `contacts` - Contact data from JobNimbus
- `invoices` - Invoice data (accrual basis for revenue)
- `estimates` - Active pipeline opportunities
- `activities` - Job activities and timeline
- `sync_log` - Sync operation logs
- `app_weekly_snapshots` - Historical weekly metrics
- `jn_*` - JobNimbus custom fields, users, statuses

### Important Columns
- `jobs.cf_string_29` = '🔑' → Real Estate segment
- `jobs.record_type_name` → Insurance/Repairs/Retail segment
- `jobs.status_name` → Maps to 6 pipeline stages via STATUS_TO_STAGE
- `invoices.date_invoice` → Revenue accrual basis (not payment date)

## Code Structure

```
src/
├── app/
│   ├── (pages)          # 9 dashboard pages
│   ├── api/             # 10+ API endpoints
│   ├── layout.tsx       # Root layout with sidebar
│   └── error.tsx        # Global error boundary
├── lib/
│   ├── constants.ts     # Status mappings, segments, colors
│   ├── dates.ts         # Date range helpers
│   ├── segment.ts       # Segment classification logic
│   ├── db.ts            # Database utilities
│   ├── jobnimbus.ts     # JN API client
│   └── sync.ts          # Sync engine
├── components/
│   ├── layout/          # Sidebar, header
│   ├── ui/              # shadcn/ui components
│   └── LoadingSkeleton.tsx  # Reusable skeletons
└── types/
    └── index.ts         # TypeScript types
```

## Metrics & Calculations

### Revenue
- **Definition:** Sum of `invoices.total` where `is_active = true`
- **Basis:** Accrual (uses `invoices.date_invoice`)
- **NOT:** Payment date or cash collected

### Pipeline Value
- **Definition:** Sum of `estimates.total` on open jobs
- **Filters:** Jobs not closed/archived, in Estimating+ statuses
- **Shows:** Potential revenue in active pipeline

### Conversion Rate
- **Definition:** Jobs reaching "Signed Contract" or later / total jobs
- **Stages:** Lead → Estimate → Signed → Production → Invoicing → Completed

### Segment Classification
- **Real Estate:** `cf_string_29 = '🔑'` (cross-cutting, overrides type)
- **Insurance:** `record_type_name = 'Insurance'`
- **Repairs:** `record_type_name = 'Repairs'`
- **Retail:** Everything else

## Common Tasks

### Adding a New Page
1. Create `src/app/new-page/page.tsx`
2. Add `useQuery` hook to fetch from `/api/endpoint`
3. Add navigation link in sidebar (`src/components/layout/sidebar.tsx`)

### Adding a New API Endpoint
1. Create `src/app/api/resource/route.ts`
2. Export `GET` and/or `POST` functions
3. Use `query()` helper from `@/lib/db`
4. Test with `curl` or Vercel logs

### Debugging Data Issues
1. Check database directly:
   ```bash
   PGPASSWORD=... psql -h db.biewckagexvxrehccaoo.supabase.co -U postgres -d postgres
   ```
2. Check sync logs: `SELECT * FROM sync_log ORDER BY created_at DESC`
3. Check status mappings in `src/lib/constants.ts`

### Vercel Logs
```bash
vercel logs maverick-command-center
```

## Known Issues

### Cold Lead Count Discrepancy
- 56 jobs showing vs ~29 expected
- Root cause: Cold/Dead statuses not archived
- Fix in progress: User archiving Cold/Dead jobs in JobNimbus
- Status: Awaiting sync

## Future Phases

### Phase 9: Full Polish
- [ ] Vercel Cron for 15-min auto-sync
- [ ] Full JobNimbus API implementation
- [ ] Mobile responsive polish pass
- [ ] Lighthouse performance audit

### Phase 10: Advanced Features
- [ ] Real-time webhooks from JobNimbus
- [ ] Forecasting models
- [ ] Custom report builder
- [ ] Export to Excel/PDF
- [ ] Slack integration

## References

- **Memory:** `/Users/jack/.claude/projects/-Users-jack/memory/MEMORY.md`
- **JobNimbus Docs:** https://jobnimbus.com/api
- **Supabase:** https://supabase.com/docs
- **Next.js:** https://nextjs.org/docs
- **Vercel:** https://vercel.com/docs

---

**Last Updated:** February 26, 2026  
**Maintained by:** Claude Code
