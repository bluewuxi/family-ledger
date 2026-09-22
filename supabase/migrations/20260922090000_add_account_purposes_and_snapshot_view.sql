-- Apply with psql --single-transaction -v ON_ERROR_STOP=1.
-- Prevent writes between backfill and installing synchronization.
lock table public.portfolio_snapshots in share row exclusive mode;

alter table public.investment_accounts
  add column if not exists purpose text not null default 'investment';

alter table public.investment_accounts
  drop constraint if exists investment_accounts_purpose_check;
alter table public.investment_accounts
  add constraint investment_accounts_purpose_check
    check (purpose in ('investment', 'daily_expense', 'education'));

create index if not exists investment_accounts_purpose_idx
  on public.investment_accounts(purpose);

create table if not exists public.portfolio_snapshot_headers (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  usd_to_nzd_rate numeric(28, 10) not null default 0 check (usd_to_nzd_rate >= 0),
  usd_to_cny_rate numeric(28, 10) not null default 0 check (usd_to_cny_rate >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists portfolio_snapshot_headers_set_updated_at on public.portfolio_snapshot_headers;
-- During coexistence the source table owns timestamps; preserve them verbatim.

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

create or replace function public.sync_portfolio_snapshot_header()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.portfolio_snapshot_headers where id = old.id;
    return old;
  end if;
  insert into public.portfolio_snapshot_headers (
    id, snapshot_date, usd_to_nzd_rate, usd_to_cny_rate, notes, created_at, updated_at
  ) values (
    new.id, new.snapshot_date, new.usd_to_nzd_rate, new.usd_to_cny_rate,
    new.notes, new.created_at, new.updated_at
  ) on conflict (id) do update set
    snapshot_date = excluded.snapshot_date,
    usd_to_nzd_rate = excluded.usd_to_nzd_rate,
    usd_to_cny_rate = excluded.usd_to_cny_rate,
    notes = excluded.notes,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists portfolio_snapshots_sync_header on public.portfolio_snapshots;
create trigger portfolio_snapshots_sync_header
after insert or update or delete on public.portfolio_snapshots
for each row execute function public.sync_portfolio_snapshot_header();

create or replace view public.portfolio_snapshots_v
with (security_invoker = true) as
select
  h.id,
  h.snapshot_date,
  case when count(a.id) = 0 then 0::numeric
       when bool_and(a.market_value_usd is not null) then round(sum(a.market_value_usd), 6)
       else null end as total_market_value_usd,
  case when count(a.id) = 0 then 0::numeric
       when bool_and(a.market_value_usd is not null and a.cost_usd is not null) then round(sum(a.cost_usd), 6)
       else null end as total_cost_usd,
  case when count(a.id) = 0 then 0::numeric
       when bool_and(a.market_value_usd is not null and a.unrealized_gain_usd is not null) then round(sum(a.unrealized_gain_usd), 6)
       else null end as unrealized_gain_usd,
  case when count(a.id) = 0 then 0::numeric
       when bool_and(a.market_value_usd is not null and a.daily_change_usd is not null) then round(sum(a.daily_change_usd), 6)
       else null end as daily_change_usd,
  case when count(a.id) = 0 then null
       when bool_and(a.market_value_usd is not null and a.daily_change_usd is not null)
        and sum(a.market_value_usd - a.daily_change_usd) <> 0
       then round(sum(a.daily_change_usd) / sum(a.market_value_usd - a.daily_change_usd) * 100, 8)
       else null end as daily_change_pct,
  h.usd_to_nzd_rate,
  h.usd_to_cny_rate,
  coalesce(w.warnings, '[]'::jsonb) as warnings,
  h.notes,
  h.created_at,
  h.updated_at
from public.portfolio_snapshot_headers h
left join public.portfolio_account_snapshots a on a.portfolio_snapshot_id = h.id
left join lateral (
  select jsonb_agg(item.value order by a2.account_name, a2.account_id, item.ordinality) as warnings
  from public.portfolio_account_snapshots a2
  cross join lateral jsonb_array_elements(a2.warnings) with ordinality as item(value, ordinality)
  where a2.portfolio_snapshot_id = h.id
) w on true
group by h.id, h.snapshot_date, h.usd_to_nzd_rate, h.usd_to_cny_rate,
  h.notes, h.created_at, h.updated_at, w.warnings;

alter table public.portfolio_snapshot_headers enable row level security;
create policy portfolio_snapshot_headers_select_family on public.portfolio_snapshot_headers
  for select to authenticated using (public.has_active_role('viewer'));
create policy portfolio_snapshot_headers_insert_admin on public.portfolio_snapshot_headers
  for insert to authenticated with check (public.has_active_role('admin'));
create policy portfolio_snapshot_headers_update_admin on public.portfolio_snapshot_headers
  for update to authenticated using (public.has_active_role('admin')) with check (public.has_active_role('admin'));
create policy portfolio_snapshot_headers_delete_admin on public.portfolio_snapshot_headers
  for delete to authenticated using (public.has_active_role('admin'));

grant select, insert, update, delete on public.portfolio_snapshot_headers to authenticated, service_role;
grant select on public.portfolio_snapshots_v to authenticated, service_role;
notify pgrst, 'reload schema';
