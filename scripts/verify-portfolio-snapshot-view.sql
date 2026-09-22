begin transaction isolation level repeatable read read only;

-- Report exact field differences before the blocking assertion; warnings are multisets.
select coalesce(old.snapshot_date, derived.snapshot_date) as snapshot_date, field.key as field,
  to_jsonb(old)->field.key as stored, to_jsonb(derived)->field.key as derived
from public.portfolio_snapshots old full join public.portfolio_snapshots_v derived using(id)
cross join lateral jsonb_object_keys(to_jsonb(derived)) as field(key)
where field.key <> 'warnings' and to_jsonb(old)->field.key is distinct from to_jsonb(derived)->field.key;

do $$
begin
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
    raise exception 'Snapshot aggregate parity check failed';
  end if;

  if exists (
    select 1 from public.portfolio_account_snapshots a
    left join public.portfolio_snapshot_headers h on h.id = a.portfolio_snapshot_id
    where h.id is null or h.snapshot_date is distinct from a.snapshot_date
  ) then
    raise exception 'Snapshot account rows have missing headers';
  end if;

  if exists (
    select 1 from public.portfolio_snapshots s
    left join public.portfolio_snapshot_headers h on h.id = s.id
    where h.id is null
  ) then
    raise exception 'Snapshot headers are incomplete';
  end if;
end;
$$;

select
  count(*) as snapshot_count,
  count(*) filter (where total_market_value_nzd is not null or total_cost_nzd is not null
    or unrealized_gain_nzd is not null or daily_change_nzd is not null) as legacy_nzd_rows
from public.portfolio_snapshots;

select count(*) as account_rows from public.portfolio_account_snapshots;
select count(*) as empty_snapshots from public.portfolio_snapshot_headers h
where not exists (select 1 from public.portfolio_account_snapshots a where a.portfolio_snapshot_id=h.id);

rollback;
