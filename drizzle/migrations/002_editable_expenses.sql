-- Migration 002: Editable expenses for cash flow forecasting
-- Adds three tables to make the /financial/cashflow page editable and forecast-aware:
--   app_recurring_expenses  — payroll, rent, insurance, software (monthly/weekly/etc)
--   app_one_time_expenses   — planned one-offs like "$20k ads June 15" or "new truck Q3"
--   app_forecast_overrides  — non-destructive manual cell edits on the forecast table
--
-- Non-destructive design: when an employee leaves or a subscription ends, set end_date;
-- NEVER DELETE rows. This preserves history for year-over-year comparison and audit.
--
-- Seeded with AI-derived recurring values from P&L Apr 2025 – Mar 2026 (latest-3-month
-- averages where the cost structure was stable). Every seeded row has source='ai_seeded'
-- so Brent (accountant) can scan and edit. Notes on each row explain the derivation.
--
-- Run manually: psql $DATABASE_URL -f drizzle/migrations/002_editable_expenses.sql
-- Or use:       npm run migrate
-- Idempotent: safe to re-run.

-- ============================================
-- Tables
-- ============================================

CREATE TABLE IF NOT EXISTS app_recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',  -- monthly | weekly | biweekly | quarterly | annual
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,  -- NULL = still active
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',  -- manual | ai_seeded | imported
  confidence TEXT,  -- high | medium | low  (for ai_seeded rows, helps Brent prioritize review)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_one_time_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  expected_date DATE NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_forecast_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  field TEXT NOT NULL,  -- inflows | outflows | running_balance
  value NUMERIC(14, 2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_start, field)
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_recurring_active_window
  ON app_recurring_expenses (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_recurring_category
  ON app_recurring_expenses (category);
CREATE INDEX IF NOT EXISTS idx_one_time_expected_date
  ON app_one_time_expenses (expected_date);
CREATE INDEX IF NOT EXISTS idx_forecast_overrides_week
  ON app_forecast_overrides (week_start);

-- ============================================
-- updated_at trigger for recurring_expenses
-- ============================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recurring_updated_at ON app_recurring_expenses;
CREATE TRIGGER trg_recurring_updated_at
BEFORE UPDATE ON app_recurring_expenses
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================
-- Seed: AI-derived recurring expenses (idempotent — only seeds on empty)
-- Source: Maverick Exteriors P&L by Month, April 2025 – March 2026
-- Method: latest-3-month average (Jan-Mar 2026) for categories where cost structure
--         stabilized (post-payroll-transition, post-QBO-consolidation)
-- Total seeded fixed recurring overhead: ~$57,046/month
-- Review with Brent. Edit rows freely; seeds are a starting point.
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_recurring_expenses WHERE source = 'ai_seeded' LIMIT 1) THEN
    INSERT INTO app_recurring_expenses (name, category, amount, frequency, source, confidence, notes) VALUES
      ('Officer Comp (Jack)',              'Payroll',    10000.00, 'monthly', 'ai_seeded', 'high',   'Flat $10k/mo since Jan 2026. Confirm with Brent whether this is all officer comp or split across owners.'),
      ('Employee Wages (aggregate)',       'Payroll',     9200.00, 'monthly', 'ai_seeded', 'medium', 'Based on Mar 2026 actual. Ramping from $0 Jan → $5.2k Feb → $9.2k Mar. Split into per-person rows as hires stabilize.'),
      ('Payroll Taxes',                    'Payroll',     2570.00, 'monthly', 'ai_seeded', 'high',   'Scales with wages + officer comp (~28% effective rate based on Mar 2026). Will rise as wages grow.'),
      ('Office/General Admin',             'Overhead',   13966.00, 'monthly', 'ai_seeded', 'high',   'Post-consolidation avg of Jan-Mar 2026. QBO consolidated Dues, Office Expenses, Software, Supplies into parent account Jan 2026 — use new parent, not old subs.'),
      ('Interest paid (seller financing)', 'Financing',   7425.00, 'monthly', 'ai_seeded', 'medium', 'Seller financing to uncle (company acquisition). Started Feb 2026. WILL DECREASE as principal paid. Review quarterly and step down.'),
      ('Advertising & Marketing',          'Marketing',   4870.00, 'monthly', 'ai_seeded', 'low',    'Highly variable in 2025 ($214-$17k range). Treat as monthly budget target, not fixed obligation.'),
      ('Vehicle Expenses',                 'Operations',  3484.00, 'monthly', 'ai_seeded', 'high',   'Post-consolidation avg of Jan-Mar 2026. Combines gas/fuel, repairs, maintenance.'),
      ('Variable/Discretionary Overhead',  'Overhead',    1500.00, 'monthly', 'ai_seeded', 'low',    'Estimate. Captures monthly noise not otherwise modeled (small prof fees, shipping, donations, parking, misc).'),
      ('Bank Charges/Processing Fees',     'Overhead',     978.00, 'monthly', 'ai_seeded', 'high',   '12-month avg. Consistent ~$40-$2.4k with processing volume.'),
      ('Insurance',                        'Overhead',     965.00, 'monthly', 'ai_seeded', 'medium', '11-month avg. Watch for annual renewal spike (was ~$6.6k in Jun 2025). Consider a separate annual row.'),
      ('Meals & Entertainment',            'Overhead',     765.00, 'monthly', 'ai_seeded', 'medium', '12-month avg. Discretionary but consistent.'),
      ('Business License/Fees',            'Overhead',     680.00, 'monthly', 'ai_seeded', 'high',   '12-month avg. Very consistent.'),
      ('Communication Services',           'Overhead',     436.00, 'monthly', 'ai_seeded', 'low',    'New line item — only Feb+Mar 2026 data ($521, $350). Low confidence until more months.'),
      ('Utilities',                        'Overhead',     207.00, 'monthly', 'ai_seeded', 'high',   '12-month avg. Rock-steady across all months.');
  END IF;
END $$;

-- ============================================
-- Seed: safety floor + COGS ratio in app_settings
-- ============================================

INSERT INTO app_settings (key, value) VALUES
  ('cashflow_safety_floor',       '330000'::jsonb),                  -- $330k = 6 months fixed overhead (Jack's target)
  ('cashflow_cogs_ratio',         '0.71'::jsonb),                    -- COGS = 71% of revenue historically
  ('cashflow_seed_source',        '"P&L Apr2025-Mar2026, AI-derived"'::jsonb),
  ('cashflow_seed_method',        '"latest-3-month average (Jan-Mar 2026)"'::jsonb)
ON CONFLICT (key) DO NOTHING;
