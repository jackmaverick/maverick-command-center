create table if not exists loop_health_snapshots (
  id bigserial primary key,
  loop_id text not null,
  status text not null check (status in ('healthy', 'warning', 'failing', 'unknown')),
  ran_at timestamptz,
  checked_at timestamptz not null default now(),
  proof_label text,
  proof_path text,
  proof_summary text,
  proof_evidence text,
  last_proof text,
  next_action text,
  approval_required boolean not null default false,
  source_repo_path text,
  source_repo text,
  source_branch text,
  health_source text not null default 'collector',
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_loop_health_snapshots_loop_checked
  on loop_health_snapshots (loop_id, checked_at desc);

create index if not exists idx_loop_health_snapshots_status
  on loop_health_snapshots (status, checked_at desc);

create table if not exists loop_health_lessons (
  id bigserial primary key,
  loop_id text not null,
  learned_at timestamptz not null default now(),
  lesson text not null,
  evidence text,
  source_ref text,
  created_by text not null default 'codex'
);

create index if not exists idx_loop_health_lessons_loop_learned
  on loop_health_lessons (loop_id, learned_at desc);
