BEGIN;

CREATE TABLE IF NOT EXISTS public.cc_outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  workspace text NOT NULL,
  contact_jnid text NOT NULL,
  job_jnid text,
  channel text NOT NULL CHECK (channel IN ('text', 'email', 'note')),
  message_mode text NOT NULL DEFAULT 'reply'
    CHECK (message_mode IN ('reply', 'new')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sending', 'delivered', 'failed', 'cancelled')),
  from_address text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  cc_addresses text[] NOT NULL DEFAULT '{}',
  subject text,
  body text NOT NULL,
  provider_thread_id text,
  provider_message_id text,
  provider_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by_email text,
  CONSTRAINT cc_outbound_scheduled_queue_check CHECK (
    status <> 'queued' OR scheduled_for IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS cc_outbound_due_queue_idx
  ON public.cc_outbound_messages (scheduled_for, id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS cc_outbound_contact_idx
  ON public.cc_outbound_messages (contact_jnid, created_at DESC);
CREATE INDEX IF NOT EXISTS cc_outbound_status_idx
  ON public.cc_outbound_messages (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cc_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace text NOT NULL,
  contact_jnid text NOT NULL,
  job_jnid text,
  channel text NOT NULL CHECK (channel IN ('text', 'email', 'note')),
  message_mode text NOT NULL DEFAULT 'reply'
    CHECK (message_mode IN ('reply', 'new')),
  from_address text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  cc_addresses text[] NOT NULL DEFAULT '{}',
  subject text,
  body text NOT NULL DEFAULT '',
  provider_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace, contact_jnid, channel, created_by_email)
);

CREATE INDEX IF NOT EXISTS cc_drafts_contact_idx
  ON public.cc_drafts (contact_jnid, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.cc_send_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_message_id uuid REFERENCES public.cc_outbound_messages(id),
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'queued', 'sending', 'delivered', 'failed', 'cancelled', 'retry')),
  actor_email text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('text', 'email', 'note')),
  from_address text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  provider_message_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_send_audit_message_idx
  ON public.cc_send_audit (outbound_message_id, created_at);

CREATE TABLE IF NOT EXISTS public.cc_sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_jnid text,
  phone_e164 text NOT NULL UNIQUE,
  keyword text NOT NULL,
  source_sms_message_id uuid,
  opted_out_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cc_sms_opt_out_contact_idx
  ON public.cc_sms_opt_outs (contact_jnid, opted_out_at DESC);

ALTER TABLE public.cc_outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_send_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_sms_opt_outs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cc_outbound_messages FROM anon, authenticated;
REVOKE ALL ON public.cc_drafts FROM anon, authenticated;
REVOKE ALL ON public.cc_send_audit FROM anon, authenticated;
REVOKE ALL ON public.cc_sms_opt_outs FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_outbound_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_drafts TO service_role;
GRANT SELECT, INSERT ON public.cc_send_audit TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.cc_sms_opt_outs TO service_role;

COMMIT;
