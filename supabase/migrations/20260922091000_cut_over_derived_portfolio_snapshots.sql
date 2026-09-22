-- Release separately, only after backup restore validation and exact parity pass.
-- An explicit transaction makes direct psql execution atomic as well.
begin;
set local lock_timeout = '15s';
lock table public.portfolio_snapshots in access exclusive mode;
lock table public.portfolio_account_snapshots in access exclusive mode;
lock table public.portfolio_snapshot_headers in access exclusive mode;

insert into public.portfolio_snapshot_headers (
  id, snapshot_date, usd_to_nzd_rate, usd_to_cny_rate, notes, created_at, updated_at
)
select id, snapshot_date, usd_to_nzd_rate, usd_to_cny_rate, notes, created_at, updated_at
from public.portfolio_snapshots
on conflict (id) do update set
  snapshot_date = excluded.snapshot_date,
  usd_to_nzd_rate = excluded.usd_to_nzd_rate,
  usd_to_cny_rate = excluded.usd_to_cny_rate,
  notes = excluded.notes,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

do $$
begin
  if exists (
    select 1 from public.portfolio_account_snapshots a
    left join public.portfolio_snapshot_headers h on h.id = a.portfolio_snapshot_id
    where h.id is null or h.snapshot_date is distinct from a.snapshot_date
  ) then
    raise exception 'Account snapshot header/date integrity check failed';
  end if;
  if exists (
    select 1
    from public.portfolio_snapshots old
    full join public.portfolio_snapshots_v derived using (id)
    where old.id is null or derived.id is null
       or old.snapshot_date is distinct from derived.snapshot_date
       or old.total_market_value_usd is distinct from derived.total_market_value_usd
       or old.total_cost_usd is distinct from derived.total_cost_usd
       or old.unrealized_gain_usd is distinct from derived.unrealized_gain_usd
       or old.daily_change_usd is distinct from derived.daily_change_usd
       or old.daily_change_pct is distinct from derived.daily_change_pct
       or old.usd_to_nzd_rate is distinct from derived.usd_to_nzd_rate
       or old.usd_to_cny_rate is distinct from derived.usd_to_cny_rate
       or old.notes is distinct from derived.notes
       or old.created_at is distinct from derived.created_at
       or old.updated_at is distinct from derived.updated_at
       or (select jsonb_agg(x order by x::text) from jsonb_array_elements(old.warnings) x)
          is distinct from
          (select jsonb_agg(x order by x::text) from jsonb_array_elements(derived.warnings) x)
  ) then
    raise exception 'portfolio_snapshots_v does not exactly match portfolio_snapshots';
  end if;
end;
$$;

alter table public.portfolio_account_snapshots
  drop constraint portfolio_account_snapshots_portfolio_snapshot_id_fkey;
alter table public.portfolio_account_snapshots
  add constraint portfolio_account_snapshots_portfolio_snapshot_id_fkey
  foreign key (portfolio_snapshot_id) references public.portfolio_snapshot_headers(id) on delete cascade;

create trigger portfolio_snapshot_headers_set_updated_at
before update on public.portfolio_snapshot_headers
for each row execute function public.set_updated_at();

create or replace function public.upsert_portfolio_snapshot(valuation jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  target_date date := (valuation->>'snapshotDate')::date;
  snapshot_id uuid;
begin
  if target_date is null or jsonb_typeof(valuation->'accounts') is distinct from 'array' then
    raise exception 'Snapshot date and accounts array are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('portfolio-snapshot:' || target_date::text, 0));
  insert into public.portfolio_snapshot_headers (snapshot_date, usd_to_nzd_rate, usd_to_cny_rate)
  values (target_date, (valuation->>'usdToNzdRate')::numeric, (valuation->>'usdToCnyRate')::numeric)
  on conflict (snapshot_date) do update set
    usd_to_nzd_rate = excluded.usd_to_nzd_rate,
    usd_to_cny_rate = excluded.usd_to_cny_rate,
    updated_at = now()
  returning id into snapshot_id;
  delete from public.portfolio_account_snapshots where portfolio_snapshot_id = snapshot_id;
  insert into public.portfolio_account_snapshots (
    portfolio_snapshot_id, snapshot_date, account_id, account_name,
    market_value_usd, cost_usd, unrealized_gain_usd, daily_change_usd, daily_change_pct, warnings
  ) select
    snapshot_id, target_date, (account->>'accountId')::uuid, account->>'accountName',
    (account->>'marketValueUsd')::numeric, (account->>'costUsd')::numeric,
    (account->>'unrealizedGainUsd')::numeric, (account->>'dailyChangeUsd')::numeric,
    (account->>'dailyChangePct')::numeric, account->'warnings'
  from jsonb_array_elements(valuation->'accounts') as account;
  return snapshot_id;
end;
$$;

drop trigger portfolio_snapshots_sync_header on public.portfolio_snapshots;
revoke all on function public.upsert_portfolio_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_portfolio_snapshot(jsonb) to service_role;
drop function public.sync_portfolio_snapshot_header();
drop function public.export_ledger_backup(uuid);
drop table public.portfolio_snapshots;
alter view public.portfolio_snapshots_v rename to portfolio_snapshots;
grant select on public.portfolio_snapshots to authenticated, service_role;

create or replace function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.profiles t), '[]'::jsonb),
    'user_roles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.user_roles t), '[]'::jsonb),
    'currencies', coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from public.currencies t), '[]'::jsonb),
    'investment_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.investment_accounts t), '[]'::jsonb),
    'instruments', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instruments t), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.transactions t), '[]'::jsonb),
    'exchange_rates', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.exchange_rates t), '[]'::jsonb),
    'instrument_prices', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instrument_prices t), '[]'::jsonb),
    'portfolio_snapshot_headers', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.portfolio_snapshot_headers t), '[]'::jsonb),
    'portfolio_account_snapshots', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.portfolio_account_snapshots t), '[]'::jsonb),
    'dashboard_instrument_quotes', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.dashboard_instrument_quotes t), '[]'::jsonb),
    'monthly_reviews', coalesce((select jsonb_agg(to_jsonb(t) order by t.month) from public.monthly_reviews t), '[]'::jsonb),
    'job_runs', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.job_runs t where excluded_job_run_id is null or t.id <> excluded_job_run_id), '[]'::jsonb),
    'data_provider_runs', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.data_provider_runs t), '[]'::jsonb)
  );
$$;
revoke all on function public.export_ledger_backup(uuid) from public, anon, authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
