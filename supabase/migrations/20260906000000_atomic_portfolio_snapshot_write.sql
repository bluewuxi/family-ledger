-- One transaction owns the aggregate and the complete account set for a date.
create or replace function public.upsert_portfolio_snapshot(valuation jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_date date := (valuation->>'snapshotDate')::date;
  snapshot_id uuid;
begin
  if target_date is null or jsonb_typeof(valuation->'accounts') is distinct from 'array' then
    raise exception 'Snapshot date and accounts array are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('portfolio-snapshot:' || target_date::text, 0));

  insert into public.portfolio_snapshots (
    snapshot_date, total_market_value_usd, total_cost_usd, unrealized_gain_usd,
    daily_change_usd, daily_change_pct, usd_to_nzd_rate, usd_to_cny_rate, warnings
  ) values (
    target_date, (valuation->>'marketValueUsd')::numeric, (valuation->>'costUsd')::numeric,
    (valuation->>'unrealizedGainUsd')::numeric, (valuation->>'dailyChangeUsd')::numeric,
    (valuation->>'dailyChangePct')::numeric, (valuation->>'usdToNzdRate')::numeric,
    (valuation->>'usdToCnyRate')::numeric, valuation->'warnings'
  ) on conflict (snapshot_date) do update set
    total_market_value_usd = excluded.total_market_value_usd,
    total_cost_usd = excluded.total_cost_usd,
    unrealized_gain_usd = excluded.unrealized_gain_usd,
    daily_change_usd = excluded.daily_change_usd,
    daily_change_pct = excluded.daily_change_pct,
    usd_to_nzd_rate = excluded.usd_to_nzd_rate,
    usd_to_cny_rate = excluded.usd_to_cny_rate,
    warnings = excluded.warnings
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

revoke all on function public.upsert_portfolio_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_portfolio_snapshot(jsonb) to service_role;
