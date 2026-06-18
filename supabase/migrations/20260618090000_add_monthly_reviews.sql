create table if not exists public.monthly_reviews (
  month text primary key,
  family_notes text not null default '',
  review_status text not null default 'in_progress',
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_reviews_month_check check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint monthly_reviews_status_check check (review_status in ('in_progress', 'complete')),
  constraint monthly_reviews_completion_check check (
    (
      review_status = 'complete'
      and completed_at is not null
      and completed_by_user_id is not null
    )
    or
    (
      review_status = 'in_progress'
      and completed_at is null
      and completed_by_user_id is null
    )
  )
);

drop trigger if exists monthly_reviews_set_updated_at on public.monthly_reviews;

create trigger monthly_reviews_set_updated_at
  before update on public.monthly_reviews
  for each row execute function public.set_updated_at();

alter table public.monthly_reviews enable row level security;

drop policy if exists monthly_reviews_select_family on public.monthly_reviews;
create policy monthly_reviews_select_family
  on public.monthly_reviews for select
  to authenticated
  using (public.has_active_role('viewer'));

drop policy if exists monthly_reviews_insert_admin on public.monthly_reviews;
create policy monthly_reviews_insert_admin
  on public.monthly_reviews for insert
  to authenticated
  with check (public.has_active_role('admin'));

drop policy if exists monthly_reviews_update_admin on public.monthly_reviews;
create policy monthly_reviews_update_admin
  on public.monthly_reviews for update
  to authenticated
  using (public.has_active_role('admin'))
  with check (public.has_active_role('admin'));

create or replace function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.profiles t), '[]'::jsonb),
    'user_roles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.user_roles t), '[]'::jsonb),
    'currencies', coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from public.currencies t), '[]'::jsonb),
    'investment_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.investment_accounts t), '[]'::jsonb),
    'instruments', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instruments t), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.transactions t), '[]'::jsonb),
    'exchange_rates', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.exchange_rates t), '[]'::jsonb),
    'instrument_prices', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instrument_prices t), '[]'::jsonb),
    'portfolio_snapshots', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.portfolio_snapshots t), '[]'::jsonb),
    'portfolio_account_snapshots', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.portfolio_account_snapshots t), '[]'::jsonb),
    'dashboard_instrument_quotes', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.dashboard_instrument_quotes t), '[]'::jsonb),
    'monthly_reviews', coalesce((select jsonb_agg(to_jsonb(t) order by t.month) from public.monthly_reviews t), '[]'::jsonb),
    'job_runs', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.id)
      from public.job_runs t
      where excluded_job_run_id is null or t.id <> excluded_job_run_id
    ), '[]'::jsonb),
    'data_provider_runs', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.data_provider_runs t), '[]'::jsonb)
  );
$$;

revoke all on function public.export_ledger_backup(uuid) from public;
revoke all on function public.export_ledger_backup(uuid) from anon;
revoke all on function public.export_ledger_backup(uuid) from authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
