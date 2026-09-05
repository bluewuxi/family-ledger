-- Run with psql -v ON_ERROR_STOP=1 against an EMPTY, disposable local database.
-- These minimal fixtures intentionally fail if business tables already exist.
\set ON_ERROR_STOP on
create table public.investment_accounts (id uuid primary key);
create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(), snapshot_date date unique not null,
  total_market_value_usd numeric(28,6), total_cost_usd numeric(28,6),
  unrealized_gain_usd numeric(28,6), daily_change_usd numeric(28,6), daily_change_pct numeric(18,8),
  usd_to_nzd_rate numeric(28,10) not null, usd_to_cny_rate numeric(28,10) not null,
  warnings jsonb not null
);
create table public.portfolio_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_snapshot_id uuid not null references public.portfolio_snapshots(id),
  snapshot_date date not null, account_id uuid not null references public.investment_accounts(id),
  account_name text not null, market_value_usd numeric(28,6), cost_usd numeric(28,6),
  unrealized_gain_usd numeric(28,6), daily_change_usd numeric(28,6), daily_change_pct numeric(18,8),
  warnings jsonb not null,
  unique (portfolio_snapshot_id, account_id), unique (snapshot_date, account_id)
);
create role anon;
create role authenticated;
create role service_role;
\ir ../supabase/migrations/20260906000000_atomic_portfolio_snapshot_write.sql
-- Applying the migration twice is safe.
\ir ../supabase/migrations/20260906000000_atomic_portfolio_snapshot_write.sql

insert into public.investment_accounts values ('00000000-0000-0000-0000-000000000001');
do $$
declare
  v jsonb := '{"snapshotDate":"2026-06-01","marketValueUsd":"100","costUsd":"80",
    "unrealizedGainUsd":"20","dailyChangeUsd":"1","dailyChangePct":"1",
    "usdToNzdRate":"1.6","usdToCnyRate":"7","warnings":[],"accounts":[{
      "accountId":"00000000-0000-0000-0000-000000000001","accountName":"A",
      "marketValueUsd":"100","costUsd":"80","unrealizedGainUsd":"20",
      "dailyChangeUsd":"1","dailyChangePct":"1","warnings":[]}]}';
  first_id uuid;
begin
  first_id := public.upsert_portfolio_snapshot(v);
  assert public.upsert_portfolio_snapshot(v) = first_id, 'Retry must keep snapshot ID';
  assert (select count(*) from public.portfolio_account_snapshots) = 1, 'Retry must not duplicate accounts';
  begin
    perform public.upsert_portfolio_snapshot(
      jsonb_set(jsonb_set(v, '{marketValueUsd}', '"999"'), '{accounts,0,accountId}',
      '"00000000-0000-0000-0000-000000000002"'));
    raise exception 'Expected account foreign key failure';
  exception when foreign_key_violation then null;
  end;
  assert (select total_market_value_usd from public.portfolio_snapshots where id = first_id) = 100,
    'Failed account write must roll back aggregate';
  assert (select market_value_usd from public.portfolio_account_snapshots where portfolio_snapshot_id = first_id) = 100,
    'Failed account write must restore old account rows';

  perform public.upsert_portfolio_snapshot(jsonb_set(jsonb_set(v, '{accounts}', '[]'), '{marketValueUsd}', '"0"'));
  assert (select count(*) from public.portfolio_account_snapshots) = 0, 'Empty account set must remove old rows';
  perform public.upsert_portfolio_snapshot(v);
  assert not has_function_privilege('anon', 'public.upsert_portfolio_snapshot(jsonb)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.upsert_portfolio_snapshot(jsonb)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.upsert_portfolio_snapshot(jsonb)', 'EXECUTE');
end;
$$;
select 'Snapshot atomicity verification passed' as result;
