BEGIN;
CREATE TABLE IF NOT EXISTS public.direct_mail_weekly_reviews (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  as_of date NOT NULL,
  generated_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND payload->>'version' = '1')
);
CREATE INDEX IF NOT EXISTS direct_mail_weekly_reviews_latest_idx
  ON public.direct_mail_weekly_reviews (as_of DESC, generated_at DESC, published_at DESC);
ALTER TABLE public.direct_mail_weekly_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_mail_weekly_reviews FROM anon, authenticated;
GRANT SELECT, INSERT ON public.direct_mail_weekly_reviews TO service_role;
COMMENT ON TABLE public.direct_mail_weekly_reviews IS
'Immutable, validated aggregate weekly analytics. Not postal proof or CRM attribution. No homeowner data or raw attachments. Published by trusted local operator only.';
COMMIT;
