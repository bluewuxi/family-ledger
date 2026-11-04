-- A pending date is durable work, not a formal valuation. Existing values stay auditable.
alter table public.portfolio_snapshot_headers add column is_available boolean not null default true;
alter table public.dashboard_instrument_quotes add column quote_at timestamptz;

create table public.snapshot_pending_dates (
  snapshot_date date primary key,
  missing_instrument_ids jsonb not null default '[]'::jsonb,
  missing_fx_currencies jsonb not null default '[]'::jsonb,
  next_attempt_at timestamptz not null default now(),
  previous_snapshot jsonb,
  updated_at timestamptz not null default now()
);
alter table public.snapshot_pending_dates enable row level security;
revoke all on public.snapshot_pending_dates from public, anon, authenticated;
grant select, insert, update, delete on public.snapshot_pending_dates to service_role;

alter function public.upsert_portfolio_snapshot_unchecked(jsonb) rename to upsert_portfolio_snapshot_before_availability;
revoke all on function public.upsert_portfolio_snapshot_before_availability(jsonb) from public, anon, authenticated, service_role;

create function public.upsert_portfolio_snapshot_unchecked(valuation jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; target date := (valuation->>'snapshotDate')::date;
begin
  if valuation->>'publicationStatus' = 'pending' then
    insert into public.snapshot_pending_dates(snapshot_date, missing_instrument_ids, missing_fx_currencies, next_attempt_at, previous_snapshot)
      values(target, coalesce(valuation->'missingInstrumentIds','[]'::jsonb), coalesce(valuation->'missingFxCurrencies','[]'::jsonb),
        now()+interval '1 day', (select to_jsonb(h)||jsonb_build_object('usd_to_nzd_rate',h.usd_to_nzd_rate::text,'usd_to_cny_rate',h.usd_to_cny_rate::text) from public.portfolio_snapshot_headers h where snapshot_date=target))
      on conflict(snapshot_date) do update set missing_instrument_ids=excluded.missing_instrument_ids,
        missing_fx_currencies=excluded.missing_fx_currencies, next_attempt_at=excluded.next_attempt_at, updated_at=now();
    update public.portfolio_snapshot_headers set is_available=false where snapshot_date=target returning id into result;
    return coalesce(result, gen_random_uuid());
  end if;
  result := public.upsert_portfolio_snapshot_before_availability(valuation);
  update public.portfolio_snapshot_headers set is_available=true where id=result;
  delete from public.snapshot_pending_dates where snapshot_date=target;
  return result;
end;
$$;
revoke all on function public.upsert_portfolio_snapshot_unchecked(jsonb) from public, anon, authenticated, service_role;

create or replace function public.invalidate_snapshot_inputs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare affected date; before_date date; after_date date;
begin
  if tg_op='UPDATE' and (to_jsonb(old)-'fetched_at'-'updated_at')=(to_jsonb(new)-'fetched_at'-'updated_at') then return new; end if;
  if tg_op<>'INSERT' then before_date := (to_jsonb(old)->>tg_argv[0])::date; end if;
  if tg_op<>'DELETE' then after_date := (to_jsonb(new)->>tg_argv[0])::date; end if;
  affected := least(before_date,after_date);
  update public.snapshot_repair_state set from_date=least(from_date,affected),token=token+1,updated_at=now() where id;
  update public.portfolio_snapshot_headers set is_available=false where snapshot_date>=affected;
  update public.snapshot_pending_dates set next_attempt_at=now() where snapshot_date>=affected;
  return null;
end;
$$;

create or replace function public.snapshot_maintenance_dates(through_date date, batch_limit integer default 30, catchup_from date default null)
returns table(snapshot_date date, repair_token text, pending_from date) language sql stable security definer set search_path = '' as $$
  with first_date as (
    select least((select min(trade_date) from public.transactions),(select min(snapshot_date) from public.portfolio_snapshot_headers)) as d
  ), candidates as (
    select day::date as d from first_date,lateral generate_series(d,through_date,interval '1 day') as day
  ) select c.d,s.token::text,s.from_date from candidates c cross join public.snapshot_repair_state s
  left join public.snapshot_pending_dates p on p.snapshot_date=c.d
  where (p.snapshot_date is null or p.next_attempt_at<=now()) and (
    (c.d>=coalesce(catchup_from,(select max(snapshot_date) from public.portfolio_snapshot_headers),through_date)
      and not exists(select 1 from public.portfolio_snapshot_headers h where h.snapshot_date=c.d and h.is_available))
    or c.d>=s.from_date or p.snapshot_date is not null)
  order by (p.snapshot_date is not null), p.next_attempt_at nulls first, c.d limit greatest(1,least(batch_limit,100));
$$;

-- The previous migration owns the complete exporter version. Append only this table.
alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_snapshot_availability;
revoke all on function public.export_ledger_backup_before_snapshot_availability(uuid) from public,anon,authenticated,service_role;
create function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.export_ledger_backup_before_snapshot_availability(excluded_job_run_id) || jsonb_build_object(
    'snapshot_pending_dates', coalesce((select jsonb_agg(to_jsonb(t) order by t.snapshot_date) from public.snapshot_pending_dates t),'[]'::jsonb));
$$;
revoke all on function public.export_ledger_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;

-- Quote publication and logical request completion share the same lease check/transaction.
create function public.complete_dashboard_quote_acquisition(lease_token uuid, quote jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare work public.price_acquisition_state; result public.dashboard_instrument_quotes;
begin
  perform 1 from public.ledger_write_state where id for update;
  select * into work from public.price_acquisition_state s
    where s.lease_token=complete_dashboard_quote_acquisition.lease_token for update;
  if not found or work.query_kind<>'latest_quote' or work.lease_expires_at<=clock_timestamp() then return null; end if;
  if (quote->>'instrument_id')::uuid<>work.instrument_id or not exists(
    select 1 from public.instruments i where i.id=work.instrument_id and i.active and i.price_update_enabled
      and i.price_source=work.source and i.price_source_symbol=quote->>'source_symbol' and i.currency=quote->>'currency'
      and quote->>'provider'=case work.source when 'yahoo_finance' then 'Yahoo Finance' when 'eastmoney' then 'Eastmoney' else null end
  ) then return null; end if;
  insert into public.dashboard_instrument_quotes(instrument_id,quote_date,quote_at,quote_price,currency,provider,source_symbol,fetched_at)
  values(work.instrument_id,(quote->>'quote_date')::date,(quote->>'quote_at')::timestamptz,(quote->>'quote_price')::numeric,
    quote->>'currency',quote->>'provider',quote->>'source_symbol',(quote->>'fetched_at')::timestamptz)
  on conflict(instrument_id,provider) do update set quote_date=excluded.quote_date,quote_at=excluded.quote_at,
    quote_price=excluded.quote_price,currency=excluded.currency,source_symbol=excluded.source_symbol,fetched_at=excluded.fetched_at
  returning * into result;
  perform public.complete_price_acquisition(complete_dashboard_quote_acquisition.lease_token,'success');
  return to_jsonb(result)||jsonb_build_object('quote_price',result.quote_price::text);
end;
$$;
revoke all on function public.complete_dashboard_quote_acquisition(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_dashboard_quote_acquisition(uuid,jsonb) to service_role;

create function public.claim_dashboard_quote_batch(source text, instrument_ids uuid[], force_retry boolean default false)
returns setof public.price_acquisition_state language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if cardinality(instrument_ids)>200 then raise exception 'Quote batch exceeds limit'; end if;
  for target in select distinct unnest(instrument_ids) order by 1 loop
    perform public.ensure_price_acquisition(source,target,'latest_quote','1970-01-01');
    return query select * from public.claim_price_acquisition(source,target,'latest_quote','1970-01-01',30,force_retry);
  end loop;
end;
$$;
revoke all on function public.claim_dashboard_quote_batch(text,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.claim_dashboard_quote_batch(text,uuid[],boolean) to service_role;
notify pgrst, 'reload schema';
