# Vercel Deployment Fix - DATABASE_URL Issue

## Problem
- Dashboard API returns 500 errors on Vercel
- DATABASE_URL environment variable appears not to be accessible to functions
- Works fine locally with exact same connection string
- Earlier logs showed connection attempt to `127.0.0.1:5432` (localhost) instead of Supabase

## Root Cause Analysis
Need to determine if:
1. Env var is set but not being passed to functions
2. Env var is malformed with extra whitespace
3. Supabase is blocking Vercel IPs
4. Next.js function isolation is preventing env var access

## Tasks

### Phase 1: Verify Environment Setup
- [ ] Check current Vercel project env vars via API or config
- [ ] Verify DATABASE_URL is set in Vercel dashboard (screenshot confirmation)
- [ ] Check if DATABASE_URL needs to be URL-encoded for special characters
- [ ] Verify CONNECTION STRING format matches PostgreSQL requirements

### Phase 2: Direct Database Test
- [ ] Create a simple Node.js test that connects to Supabase directly
- [ ] If test passes locally, try from Vercel Function (not via Next.js API)
- [ ] Test raw `psql` connection to confirm Supabase is accessible from Vercel IPs

### Phase 3: Code-Level Debugging
- [ ] Add console.log that captures actual DATABASE_URL value being used
- [ ] Add pre-connection error handling to catch connection before it fails
- [ ] Test if env var is accessible in different parts of the app (middleware, API, pages)
- [ ] Check if NODE_ENV affects env var access in Vercel

### Phase 4: Deploy & Verify
- [ ] Deploy debugging changes to Vercel
- [ ] Check Vercel function logs to see actual error details
- [ ] If still failing, try setting env var via different method (secrets, etc)
- [ ] Once working, clean up debug code and redeploy

### Phase 5: Test Live Dashboard
- [ ] Verify `/api/dashboard` returns data (not error)
- [ ] Verify `/api/pipeline` returns data
- [ ] Verify other API endpoints work
- [ ] Full dashboard page loads with real data

---
Progress tracking: Update this file as you complete each task
