alter table public.job_runs
  add column trigger_source text not null default 'schedule',
  add column triggered_by_user_id uuid references auth.users(id),
  add column trigger_request_id text;

alter table public.job_runs
  add constraint job_runs_trigger_source_check check (trigger_source in ('schedule', 'manual'));

create index job_runs_trigger_source_started_at_idx on public.job_runs(trigger_source, job_started_at desc);
create index job_runs_triggered_by_user_id_idx on public.job_runs(triggered_by_user_id);
