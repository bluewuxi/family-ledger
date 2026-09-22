-- Run against an isolated restored database AFTER applying the real cutover migration.
-- All fixture writes roll back. Tests the actual RPC, never a copied implementation.
\set ON_ERROR_STOP on
begin;
do $$
declare
  account_id uuid := gen_random_uuid();
  snapshot_id uuid;
  v jsonb;
  result public.portfolio_snapshots%rowtype;
begin
  assert (select relkind = 'v' from pg_class where oid = 'public.portfolio_snapshots'::regclass), 'Cutover required';
  insert into public.investment_accounts(id, name, account_type, base_currency, market_region)
    values(account_id, 'Snapshot verification', 'bank', 'USD', 'US');
  assert (select purpose = 'investment' from public.investment_accounts where id = account_id), 'Default purpose';
  begin
    update public.investment_accounts set purpose = 'invalid' where id = account_id;
    raise exception 'Expected invalid purpose failure';
  exception when check_violation then null; end;
  begin
    update public.investment_accounts set purpose = null where id = account_id;
    raise exception 'Expected null purpose failure';
  exception when not_null_violation then null; end;
  v := jsonb_build_object('snapshotDate', '2099-06-01', 'usdToNzdRate', '1.6', 'usdToCnyRate', '7',
    'marketValueUsd', '999999', 'accounts', jsonb_build_array(jsonb_build_object(
      'accountId', account_id, 'accountName', 'A', 'marketValueUsd', '100', 'costUsd', '120',
      'unrealizedGainUsd', '-20', 'dailyChangeUsd', '1', 'dailyChangePct', '999',
      'warnings', '[{"code":"MISSING_PRICE"},{"code":"MISSING_PRICE"}]'::jsonb)));
  snapshot_id := public.upsert_portfolio_snapshot(v);
  assert public.upsert_portfolio_snapshot(v) = snapshot_id, 'Retry preserves ID';
  select * into result from public.portfolio_snapshots where id = snapshot_id;
  assert result.total_market_value_usd = 100, 'Ignore aggregate input';
  assert result.unrealized_gain_usd = -20, 'Negative gain';
  assert result.daily_change_pct = 1.01010101, 'Percentage from prior total';
  assert jsonb_array_length(result.warnings) = 2, 'Warning duplicates';
  assert (select count(*) = 1 from public.portfolio_account_snapshots where portfolio_snapshot_id=snapshot_id), 'No duplicate rows';
  begin
    perform public.upsert_portfolio_snapshot(jsonb_set(v, '{accounts,0,accountId}', to_jsonb(gen_random_uuid())));
    raise exception 'Expected foreign key failure';
  exception when foreign_key_violation then null; end;
  assert (select total_market_value_usd = 100 from public.portfolio_snapshots where id=snapshot_id), 'Failed replacement rolls back';
  perform public.upsert_portfolio_snapshot(jsonb_set(v, '{accounts,0,costUsd}', 'null'));
  assert (select total_cost_usd is null and total_market_value_usd = 100 from public.portfolio_snapshots where id=snapshot_id), 'Unavailable cost';
  perform public.upsert_portfolio_snapshot(jsonb_set(v, '{accounts,0,marketValueUsd}', 'null'));
  assert (select total_market_value_usd is null and total_cost_usd is null and daily_change_usd is null and daily_change_pct is null from public.portfolio_snapshots where id=snapshot_id), 'Unavailable valuation/FX propagates';
  perform public.upsert_portfolio_snapshot(jsonb_set(v, '{accounts,0,dailyChangeUsd}', '"100"'));
  assert (select daily_change_pct is null from public.portfolio_snapshots where id=snapshot_id), 'Zero prior value';
  perform public.upsert_portfolio_snapshot(jsonb_set(v, '{accounts,0,marketValueUsd}', '"100.0000005"'));
  assert (select total_market_value_usd = 100.000001 and daily_change_pct = round(1 / 99.000001 * 100, 8) from public.portfolio_snapshots where id=snapshot_id), 'Rounding boundary';
  perform public.upsert_portfolio_snapshot(jsonb_set(v, '{accounts}', '[]'));
  assert (select total_market_value_usd = 0 and total_cost_usd = 0 and unrealized_gain_usd = 0 and daily_change_usd = 0 and daily_change_pct is null and warnings = '[]'::jsonb from public.portfolio_snapshots where id=snapshot_id), 'Empty snapshot';
  perform public.upsert_portfolio_snapshot(v);
  delete from public.portfolio_snapshot_headers where id=snapshot_id;
  assert not exists (select 1 from public.portfolio_account_snapshots where portfolio_snapshot_id=snapshot_id), 'Header cascade';
  assert public.export_ledger_backup() ? 'portfolio_snapshot_headers', 'Backup stores headers';
  assert not (public.export_ledger_backup() ? 'portfolio_snapshots'), 'Backup excludes view';
  assert not has_function_privilege('authenticated', 'public.upsert_portfolio_snapshot(jsonb)', 'EXECUTE'), 'RPC restricted';
end $$;
rollback;
