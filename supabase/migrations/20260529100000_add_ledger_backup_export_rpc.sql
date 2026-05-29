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
