-- Calculations remain in TypeScript. Only guarded, atomic publication is public.
alter function public.upsert_portfolio_snapshot(jsonb) rename to upsert_portfolio_snapshot_unchecked;
revoke all on function public.upsert_portfolio_snapshot_unchecked(jsonb) from public, anon, authenticated, service_role;

create function public.upsert_portfolio_snapshot(valuation jsonb, expected_revision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; snapshot_id uuid;
begin
  select revision into current_revision from public.ledger_write_state where id for update;
  if current_revision::text is distinct from expected_revision then
    raise exception using errcode = '40001', message = 'Ledger changed during snapshot calculation';
  end if;
  snapshot_id := public.upsert_portfolio_snapshot_unchecked(valuation);
  return jsonb_build_object('snapshotId', snapshot_id, 'revision', (select revision::text from public.ledger_write_state where id));
end;
$$;
revoke all on function public.upsert_portfolio_snapshot(jsonb,text) from public, anon, authenticated;
grant execute on function public.upsert_portfolio_snapshot(jsonb,text) to service_role;

-- The transaction RPC already owns the ledger lock before publishing snapshots.
do $$ declare definition text; begin
  select pg_get_functiondef('public.commit_transaction_write(text,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure) into definition;
  definition := replace(definition, 'public.upsert_portfolio_snapshot(snapshot)', 'public.upsert_portfolio_snapshot_unchecked(snapshot)');
  execute definition;
end $$;
alter function public.commit_transaction_write(text,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,boolean) security definer;

create table public.snapshot_repair_state (
  id boolean primary key default true check (id), from_date date,
  token bigint not null default 0, updated_at timestamptz not null default now()
);
insert into public.snapshot_repair_state(id,from_date)
select true, min(pending_snapshot_from) from public.kernel_nta_refresh_state;
alter table public.snapshot_repair_state enable row level security;
revoke all on public.snapshot_repair_state from public, anon, authenticated;
grant select on public.snapshot_repair_state to service_role;

-- A one-time explicit historical request must survive bounded batches/restarts.
-- Publish it before reading work or waiting for an upstream job to recover.
create function public.request_snapshot_catchup(from_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if from_date is null then raise exception 'Catchup date is required'; end if;
  update public.snapshot_repair_state s
    set from_date=least(s.from_date,request_snapshot_catchup.from_date), token=token+1, updated_at=now()
    where id;
end;
$$;
revoke all on function public.request_snapshot_catchup(date) from public, anon, authenticated;
grant execute on function public.request_snapshot_catchup(date) to service_role;

create function public.invalidate_snapshot_inputs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare affected date; before_date date; after_date date;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return new; end if;
  if tg_op <> 'INSERT' then before_date := (to_jsonb(old)->>tg_argv[0])::date; end if;
  if tg_op <> 'DELETE' then after_date := (to_jsonb(new)->>tg_argv[0])::date; end if;
  affected := least(before_date,after_date);
  update public.snapshot_repair_state set from_date = least(from_date,affected), token = token+1, updated_at=now() where id;
  return null;
end;
$$;
revoke all on function public.invalidate_snapshot_inputs() from public, anon, authenticated, service_role;
create trigger invalidate_snapshot_prices after insert or update or delete on public.instrument_prices
for each row execute function public.invalidate_snapshot_inputs('price_date');
create trigger invalidate_snapshot_fx after insert or update or delete on public.exchange_rates
for each row execute function public.invalidate_snapshot_inputs('rate_date');

create function public.advance_snapshot_repair(expected_token text, next_date date)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.snapshot_repair_state set from_date=next_date, updated_at=now() where id and token::text=expected_token;
  return found;
end;
$$;
revoke all on function public.advance_snapshot_repair(text,date) from public, anon, authenticated;
grant execute on function public.advance_snapshot_repair(text,date) to service_role;

create function public.snapshot_maintenance_dates(through_date date, batch_limit integer default 30, catchup_from date default null)
returns table(snapshot_date date, repair_token text, pending_from date) language sql stable security definer set search_path = '' as $$
  with first_date as (select least((select min(trade_date) from public.transactions), (select min(snapshot_date) from public.portfolio_snapshot_headers)) as d), candidates as (
    select day::date as d from first_date,
      lateral generate_series(d,through_date,interval '1 day') as day
  ) select c.d, s.token::text, s.from_date from candidates c cross join public.snapshot_repair_state s
  where (c.d >= coalesce(catchup_from, (select max(snapshot_date) from public.portfolio_snapshot_headers), through_date)
     and not exists(select 1 from public.portfolio_snapshot_headers h where h.snapshot_date=c.d))
     or c.d >= s.from_date
  order by c.d limit greatest(1,least(batch_limit,100));
$$;
revoke all on function public.snapshot_maintenance_dates(date,integer,date) from public, anon, authenticated;
grant execute on function public.snapshot_maintenance_dates(date,integer,date) to service_role;
notify pgrst, 'reload schema';
