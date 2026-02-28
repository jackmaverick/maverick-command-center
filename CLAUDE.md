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

### Phase 10: Speed-to-Lead Spam Filtering
- [ ] **Option 1 (Quick Win): OpenPhone contact exclusion**
  - Add `is_excluded BOOLEAN DEFAULT false` to `contacts` table
  - Add UI in Command Center Settings page to flag spam/junk contacts
  - Update `/api/speed-to-lead` queries to exclude flagged contacts
  - Backfill: review existing contacts and flag known spam/vendors/wrong numbers
- [ ] **Option 2 (Long-term): GHL conversation data**
  - Finish GHL sync integration (webhook handler + sync scripts already scaffolded)
  - Pull GHL contact statuses (active/DND/spam/lost) into Supabase
  - Use GHL pipeline stage to only measure contacts in sales funnel
  - Replace or supplement OpenPhone data with GHL conversation attribution
- [ ] **QuickBooks API integration** — cross-reference revenue numbers for accuracy

### Phase 11: Advanced Features
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

**Last Updated:** February 28, 2026
**Maintained by:** Claude Code

## Status Mapping Corrections (Feb 26)

### Critical Fix: "Signed Contract" Removed
- **Issue**: Database and old code referenced "Signed Contract" status which no longer exists in JobNimbus
- **Resolution**: Updated all references to "Signed Job" (the actual winning status in current system)
- **Impact**: Fixed data accuracy across all APIs and conversion calculations
- **Files Changed**: constants.ts, sales, pipeline, segments, snapshots, dashboard, speed-to-lead APIs

### Warranty Segment Added
- Added "warranty" to SEGMENTS and all segment-related queries
- Updated VALID_SEGMENTS in all APIs to include warranty
- Fixed segment breakdown reporting across all endpoints

## Status-to-Status Conversion Tracking (Feb 26)

### New Features
**API Endpoint:** `GET /api/conversions`
- Track conversions between specific status pairs
- Supports period, segment, and rep filters
- Returns conversion counts and rates

**Conversions Tracked:**
1. Lead → Appointment Scheduled (first appointment conversion)
2. Lead → Estimating (direct estimate, no appointment)
3. Appointment Scheduled → Estimating (post-appointment estimate)
4. Appointment Scheduled → Lost/Cold/Dead (appointment drop-off)
5. Estimating → Estimate Sent (estimate completion)
6. Estimate Sent → Sold Job (close rate)
7. Estimate Sent → Lost/Cold/Dead (estimate rejection)

**Component:** `ConversionFunnel`
- Visualizes pipeline conversions as a funnel
- Shows converted job counts and conversion rates
- Progress bars for visual representation
- Can be added to any page (e.g., sales dashboard)

### Implementation Details
- Uses `STATUS_CONVERSIONS` array from `constants.ts`
- Each conversion has `from`, `to`, and `label` fields
- To statuses can be single status or array (for drop-off paths)
- Query endpoint: `/api/conversions?period=month&segment=retail&rep_jnid=xxx`

### Future Enhancements
- Add `job_status_history` table for precise status transition tracking
- Calculate average days between status transitions
- Add conversion trends over time
- Build detailed rep-by-rep conversion breakdowns

