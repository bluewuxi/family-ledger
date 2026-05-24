alter table public.portfolio_snapshots
  add column if not exists total_market_value_usd numeric(28, 6),
  add column if not exists total_cost_usd numeric(28, 6),
  add column if not exists unrealized_gain_usd numeric(28, 6),
  add column if not exists daily_change_usd numeric(28, 6),
  add column if not exists usd_to_nzd_rate numeric(28, 10) not null default 0,
  add column if not exists usd_to_cny_rate numeric(28, 10) not null default 0,
  add column if not exists warnings jsonb not null default '[]'::jsonb;

alter table public.portfolio_snapshots
  add constraint portfolio_snapshots_total_market_value_usd_non_negative_check
    check (total_market_value_usd is null or total_market_value_usd >= 0),
  add constraint portfolio_snapshots_total_cost_usd_non_negative_check
    check (total_cost_usd is null or total_cost_usd >= 0),
  add constraint portfolio_snapshots_usd_to_nzd_rate_non_negative_check
    check (usd_to_nzd_rate >= 0),
  add constraint portfolio_snapshots_usd_to_cny_rate_non_negative_check
    check (usd_to_cny_rate >= 0),
  add constraint portfolio_snapshots_warnings_array_check
    check (jsonb_typeof(warnings) = 'array');

create table public.portfolio_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_snapshot_id uuid not null references public.portfolio_snapshots(id) on delete cascade,
  snapshot_date date not null,
  account_id uuid not null references public.investment_accounts(id) on delete cascade,
  account_name text not null,
  market_value_usd numeric(28, 6),
  cost_usd numeric(28, 6),
  unrealized_gain_usd numeric(28, 6),
  daily_change_usd numeric(28, 6),
  daily_change_pct numeric(18, 8),
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_account_snapshots_market_value_usd_non_negative_check
    check (market_value_usd is null or market_value_usd >= 0),
  constraint portfolio_account_snapshots_cost_usd_non_negative_check
    check (cost_usd is null or cost_usd >= 0),
  constraint portfolio_account_snapshots_warnings_array_check
    check (jsonb_typeof(warnings) = 'array'),
  constraint portfolio_account_snapshots_snapshot_account_key unique (portfolio_snapshot_id, account_id),
  constraint portfolio_account_snapshots_date_account_key unique (snapshot_date, account_id)
);

create index portfolio_account_snapshots_snapshot_date_idx
  on public.portfolio_account_snapshots(snapshot_date);
create index portfolio_account_snapshots_account_date_idx
  on public.portfolio_account_snapshots(account_id, snapshot_date desc);
create index portfolio_account_snapshots_portfolio_snapshot_id_idx
  on public.portfolio_account_snapshots(portfolio_snapshot_id);

create trigger portfolio_account_snapshots_set_updated_at
  before update on public.portfolio_account_snapshots
  for each row execute function public.set_updated_at();

alter table public.portfolio_account_snapshots enable row level security;

create policy portfolio_account_snapshots_select_family
  on public.portfolio_account_snapshots for select to authenticated
  using (public.has_active_role('viewer'));
create policy portfolio_account_snapshots_insert_admin
  on public.portfolio_account_snapshots for insert to authenticated
  with check (public.has_active_role('admin'));
create policy portfolio_account_snapshots_update_admin
  on public.portfolio_account_snapshots for update to authenticated
  using (public.has_active_role('admin')) with check (public.has_active_role('admin'));
create policy portfolio_account_snapshots_delete_admin
  on public.portfolio_account_snapshots for delete to authenticated
  using (public.has_active_role('admin'));
