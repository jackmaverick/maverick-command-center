-- Maverick Command Center - Initial Schema
-- Run against Neon Postgres
-- NOTE: JN data (jobs, contacts, estimates, etc.) lives in Supabase and is queried directly.
-- Only app-specific tables go on Neon.

-- ============================================
-- App Tables (Neon only)
-- ============================================

CREATE TABLE IF NOT EXISTS app_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'weekly',
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_start, snapshot_type)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  records_synced INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  error_message TEXT
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_snapshots_week ON app_weekly_snapshots(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON app_weekly_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_app_sync_log_entity ON app_sync_log(entity_type);
