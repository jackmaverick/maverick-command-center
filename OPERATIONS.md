# Maverick Command Center - Operations Runbook

**Live Site:** https://maverick-command-center.vercel.app  
**GitHub:** https://github.com/jackmaverick/maverick-command-center  
**Database:** Supabase `biewckagexvxrehccaoo`

## Daily Operations

### Check Dashboard Health
```bash
# Visit the live site
https://maverick-command-center.vercel.app

# Verify all pages load
- Home (KPIs, funnel, activity)
- Pipeline (stage visualization)
- Segments (Real Estate, Retail, Insurance, Repairs)
- Sales (rep performance)
- Speed to Lead (response times)
- Lead Sources (source analysis)
- Weekly Review (historical trends)
- Agents (agent status)
- Settings (integration docs)
```

### Monitor Data Sync
```bash
# Check last sync status
curl https://maverick-command-center.vercel.app/api/sync

# Expected response:
{
  "recentLogs": [
    { "resource": "jobs", "status": "completed", "created_at": "...", "details": {...} }
  ],
  "status": "connected"
}
```

### Verify Database Connection
```bash
# Test dashboard API (should return KPIs)
curl "https://maverick-command-center.vercel.app/api/dashboard?period=month"

# Test pipeline API
curl "https://maverick-command-center.vercel.app/api/pipeline?period=month"

# Test segment data
curl "https://maverick-exteriors.vercel.app/api/segments?segment=retail&period=month"
```

## Troubleshooting

### Dashboard Shows Old Data

**Check:**
1. Data sync status: `GET /api/sync`
2. JobNimbus for recent updates
3. Verify Lead count is ~29 after Cold/Dead archiving

**Fix:**
```bash
# Manual sync (triggers incremental update)
curl -X POST https://maverick-command-center.vercel.app/api/sync
```

### Lead Count Discrepancy

**Current Status:** Awaiting sync after Cold/Dead archiving

**If still showing 56 after JobNimbus archiving:**
```bash
# Check database directly
PGPASSWORD=... psql -h db.biewckagexvxrehccaoo.supabase.co -U postgres -d postgres << EOF
SELECT status_name, COUNT(*) 
FROM jobs 
WHERE is_active = true AND is_archived = false
  AND status_name IN ('Lead', 'New', 'Cold Lead', 'Cold', 'Appointment Scheduled', 'Needs Rescheduling')
GROUP BY status_name
ORDER BY count DESC;
EOF
```

### API Endpoint 500 Error

**Check:**
1. Vercel logs: `vercel logs maverick-command-center`
2. Database connection: TEST DATABASE_URL env var
3. Required env vars set: `vercel env list`

**Common Issues:**
- Missing `DATABASE_URL` on Vercel
- Cold/Dead jobs making Lead count wrong
- Invalid period parameter (use: week, month, quarter, ytd, all)

### Vercel Deployment Issues

**Check build logs:**
```bash
vercel logs --follow
```

**Redeploy manually:**
```bash
cd ~/maverick-exteriors/Github\ Repos/maverick-command-center
git push origin main
# Wait 60 seconds for auto-deploy
```

**Force redeploy:**
```bash
vercel redeploy
```

## Maintenance Tasks

### Weekly
- [ ] Check dashboard loads without errors
- [ ] Verify sync status (GET /api/sync)
- [ ] Monitor Vercel deployment health
- [ ] Check for any error logs

### Monthly
- [ ] Review CLAUDE.md for accuracy
- [ ] Audit API performance (Vercel Analytics)
- [ ] Verify segment classification (Real Estate, etc.)
- [ ] Check database backup status (Supabase)

### As Needed
- [ ] Archive stale leads in JobNimbus (Cold, Dead status)
- [ ] Update status mappings in `constants.ts` if JN changes
- [ ] Rebuild and redeploy if env vars change

## Emergency Recovery

### Full Data Recovery from JobNimbus
```bash
# 1. Verify ADMIN_RECOVERY_KEY is set
vercel env list | grep ADMIN_RECOVERY_KEY

# 2. Trigger recovery (clears sync cursors)
curl -X POST https://maverick-command-center.vercel.app/api/recovery \
  -H "Authorization: Bearer $ADMIN_RECOVERY_KEY"

# 3. Run full sync (will process all JobNimbus data)
curl -X POST https://maverick-command-center.vercel.app/api/sync

# 4. Monitor sync logs
curl https://maverick-command-center.vercel.app/api/sync

# 5. Verify data appears in dashboard
# Visit https://maverick-command-center.vercel.app
```

### Database Connection Lost
```bash
# 1. Verify DATABASE_URL on Vercel
vercel env list | grep DATABASE_URL

# 2. Check Supabase project is running
# Visit https://app.supabase.com/project/biewckagexvxrehccaoo

# 3. Redeploy with env vars
cd ~/maverick-exteriors/Github\ Repos/maverick-command-center
vercel redeploy

# 4. Test connection
curl "https://maverick-command-center.vercel.app/api/dashboard?period=month"
```

### Deploy Latest Code
```bash
cd ~/maverick-exteriors/Github\ Repos/maverick-command-center

# Ensure local changes are committed
git status

# Push to GitHub (triggers Vercel auto-deploy)
git push origin main

# Wait 60 seconds, then verify
curl https://maverick-command-center.vercel.app/api/dashboard?period=month
```

## Performance Monitoring

### Check Vercel Metrics
```bash
vercel analytics
```

### Query Database Performance
```bash
# Check slowest queries
PGPASSWORD=... psql -h db.biewckagexvxrehccaoo.supabase.co -U postgres -d postgres << EOF
SELECT query, calls, mean_time FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;
EOF
```

### Frontend Performance
- Visit Vercel dashboard: https://vercel.com/maverickexteriors/maverick-command-center
- Check Web Vitals
- Review recent deployments

## Alerting & Notifications

### Set Slack Notifications (Future)
1. Connect Vercel to Slack workspace
2. Configure deploy notifications
3. Configure error alerts

### Monitor Manually
- Check dashboard every morning
- Review sync logs weekly
- Verify Lead count after data cleanup

## Documentation

- **Project Guide:** `CLAUDE.md` (architecture, stack, debugging)
- **Deployment:** `DEPLOYMENT.md` (pre-deploy checklist)
- **Operations:** `OPERATIONS.md` (this file)
- **Code:** `/src` directory (all pages and APIs)

## Escalation Path

**If dashboard is down:**
1. Check Vercel status: https://www.vercel.com/status
2. Check database: Supabase status
3. Review Vercel logs: `vercel logs`
4. Redeploy code: `git push origin main`
5. Contact Vercel support if needed

**If data is wrong:**
1. Check JobNimbus data directly
2. Verify sync logs: `GET /api/sync`
3. Check status mappings: `src/lib/constants.ts`
4. Trigger manual sync: `POST /api/sync`
5. Consider full recovery if needed: `POST /api/recovery`

---

**Last Updated:** February 26, 2026  
**Maintained by:** Claude Code
