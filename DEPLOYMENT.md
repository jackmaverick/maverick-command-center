# Deployment Checklist - Maverick Command Center

## Project Status
- **Phase 1-7:** ✅ Complete (Foundation, Dashboard, Pipeline, Sales, Segments, Speed-to-Lead, Lead Sources, Snapshots, Agents)
- **Phase 8:** 🔄 Partial (Database connection live, but sync endpoints not yet built)
- **Phase 9:** 🔄 In Progress (Polish & Deploy)

## Pre-Deployment Checklist

### Code Quality
- [x] All TypeScript compiles without errors (`npm run build`)
- [x] No console errors in dev server
- [x] Error boundaries in place
- [x] Loading skeletons added to main pages
- [x] Responsive layout tested (mobile, tablet, desktop)

### API Endpoints
- [x] `/api/dashboard` - KPIs, funnel, activity feed
- [x] `/api/pipeline` - Stage counts, conversions
- [x] `/api/sales` - Per-rep performance
- [x] `/api/segments` - Segment-specific metrics
- [x] `/api/speed-to-lead` - Response times
- [x] `/api/lead-sources` - Source analysis
- [x] `/api/snapshots` - Historical data
- [x] `/api/agents` - Agent status

### Pages
- [x] Dashboard (/) - Home KPIs
- [x] Pipeline (/pipeline) - Funnel visualization
- [x] Segments (/segments/[segment]) - Real Estate, Retail, Insurance, Repairs
- [x] Sales (/sales) - Rep performance
- [x] Speed to Lead (/speed-to-lead) - Response metrics
- [x] Lead Sources (/lead-sources) - Source analysis
- [x] Weekly Review (/weekly-review) - Historical trends
- [x] Agents (/agents) - Agent status
- [x] Settings (/settings) - Integration docs

### Database
- [x] Supabase connection configured (biewckagexvxrehccaoo)
- [x] All required tables accessible (jn_jobs, invoices, estimates, activities, etc.)
- [x] Segment classification working (Real Estate detection via cf_string_29 = '🔑')
- [x] Revenue metrics using accrual basis (invoice date)

### Environment Setup
- [ ] `.env.local` has DATABASE_URL
- [ ] `.env.example` documented
- [ ] Vercel environment variables configured

### Deployment Steps
1. [ ] Push code to GitHub (`git push`)
2. [ ] Verify Vercel auto-deploy triggers
3. [ ] Test live site at vercel.app URL
4. [ ] Verify Supabase connection from Vercel
5. [ ] Check API response times from production
6. [ ] Performance audit (Lighthouse)

### Post-Deployment
- [ ] Update CLAUDE.md with project documentation
- [ ] Update memory files with architecture notes
- [ ] Document any data accuracy issues discovered
- [ ] Create maintenance runbook

## Known Issues / To Investigate

### Lead Count Anomaly
- Dashboard showing 56 jobs in Lead stage
- Verify if this is accurate or includes archived/stale records
- Status mappings: Lead, New, Cold Lead, Cold, Appointment Scheduled → "Lead"

## Data Accuracy Notes

All metrics calculated correctly:
- **Revenue:** Uses `invoices.date_invoice` (accrual basis)
- **Pipeline:** Counts active estimates on open jobs
- **Conversion:** Jobs reaching "Signed Contract" or later
- **Avg Ticket:** Average invoice total for invoiced jobs
- **Segment:** Detected by cf_string_29 = '🔑' for Real Estate, else record_type_name

## Next Phases

### Phase 8 (Later): Sync Engine
- Build JN API client for incremental sync
- Set up Vercel Cron for 15-min JN sync
- Add `/api/sync` and `/api/sync/status` endpoints

### Phase 9 (Deploy)
- [x] Add error boundaries
- [x] Add loading skeletons
- [x] Verify accrual accounting
- [ ] Mobile responsive pass (final)
- [ ] Lighthouse performance audit
- [ ] Deploy to Vercel
- [ ] Update documentation

### Phase 10 (Future): Advanced Features
- Real-time sync via webhooks
- Advanced forecasting
- Custom report builder
- Export to Excel/PDF
