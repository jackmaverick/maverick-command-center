alter table loop_health_snapshots
  drop constraint if exists loop_health_snapshots_status_check;

alter table loop_health_snapshots
  add constraint loop_health_snapshots_status_check
  check (status in ('healthy', 'warning', 'failing', 'stale', 'paused', 'unknown'));
