begin;

alter table public.kernel_price_anchors
  add column proxy_value_type text not null default 'open' check (proxy_value_type in ('open', 'nta')),
  add column proxy_announcement_id bigint,
  add column proxy_published_at timestamptz,
  add column derived_from_anchor_id uuid references public.kernel_price_anchors(id) on delete restrict;
alter table public.kernel_price_anchors add constraint kernel_nta_metadata_check check (
  proxy_value_type <> 'nta' or (proxy_announcement_id > 0 and proxy_published_at is not null and proxy_price_date > anchor_date)
);
alter table public.kernel_price_anchors drop constraint kernel_price_anchors_idempotency_key;
create unique index kernel_nta_revision_key on public.kernel_price_anchors(derived_from_anchor_id, proxy_announcement_id)
  where derived_from_anchor_id is not null;
create unique index kernel_nta_actual_retry_key on public.kernel_price_anchors(
  instrument_id,anchor_date,kernel_unit_price,proxy_close,proxy_price_date,proxy_announcement_id)
  where derived_from_anchor_id is null and proxy_value_type='nta';
comment on column public.kernel_price_anchors.proxy_close is 'Compatibility field: raw open for open anchors, published per-unit NZD NTA for nta anchors.';

create table public.kernel_nta_refresh_state (
  instrument_id uuid primary key references public.instruments(id),
  pending_snapshot_from date,
  refresh_token uuid not null default gen_random_uuid()
);
alter table public.kernel_nta_refresh_state enable row level security;
revoke all on public.kernel_nta_refresh_state from public, anon, authenticated;
grant select on public.kernel_nta_refresh_state to service_role;

create function public.list_kernel_nta_anchors() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('kernel_unit_price',a.kernel_unit_price::text,
    'proxy_close',a.proxy_close::text) order by a.anchor_date desc,a.created_at desc,a.id desc),'[]'::jsonb)
  from kernel_price_anchors a;
$$;
revoke all on function public.list_kernel_nta_anchors() from public,anon,authenticated;
grant execute on function public.list_kernel_nta_anchors() to service_role;

-- Disable old application writers at cutover; the new writer locks the target.
revoke execute on function public.save_kernel_price_anchor(uuid,date,numeric,text,text,numeric,date,timestamptz,uuid,jsonb) from service_role;
create function public.reject_legacy_kernel_estimate() returns trigger language plpgsql as $$
begin
  if new.provider='Kernel Estimate (USF.NZ)' then raise exception 'Legacy Kernel opening-price estimator is retired'; end if;
  return new;
end $$;
create trigger reject_legacy_kernel_estimate before insert or update on public.instrument_prices
  for each row execute function public.reject_legacy_kernel_estimate();

create function public.refresh_kernel_nta(
  p_instrument_id uuid, p_from_date date, p_fetched_at timestamptz, p_anchors jsonb, p_estimates jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target public.instruments%rowtype;
  source public.kernel_price_anchors%rowtype;
  item record;
  change_date date;
  exact_change_date date;
  changed_count integer := 0;
  first_anchor boolean;
  state public.kernel_nta_refresh_state%rowtype;
begin
  select * into target from instruments where id = p_instrument_id for update;
  if not found or target.symbol <> 'KERNEL_SP500_UNHEDGED' or target.currency <> 'NZD'
    or target.price_source <> 'kernel_estimate' or target.price_source_symbol <> 'USF.NZ' then
    raise exception 'Invalid Kernel NTA target';
  end if;
  if p_from_date is null or p_fetched_at is null or jsonb_typeof(p_anchors) <> 'array'
    or jsonb_array_length(p_anchors) = 0 or jsonb_typeof(p_estimates) <> 'array' then raise exception 'Invalid NTA refresh payload'; end if;
  select not exists(select 1 from kernel_price_anchors where instrument_id = p_instrument_id) into first_anchor;
  if exists(select 1 from kernel_price_anchors a where a.instrument_id = p_instrument_id and a.derived_from_anchor_id is null
    and not exists(select 1 from jsonb_to_recordset(p_anchors) as j(source_id uuid) where j.source_id = a.id)) then
    raise exception 'Stale Kernel anchor set; retry refresh';
  end if;
  for item in select * from jsonb_to_recordset(p_anchors) as a(source_id uuid, anchor_date date,
    kernel_unit_price numeric, proxy_close numeric, proxy_price_date date, announcement_id bigint,
    published_at timestamptz, created_by_user_id uuid, revision_at timestamptz)
  loop
    if item.source_id is null or item.anchor_date is null or item.anchor_date < p_from_date
      or item.kernel_unit_price is null or item.kernel_unit_price <= 0
      or item.kernel_unit_price::text in ('NaN','Infinity','-Infinity')
      or item.proxy_close is null or item.proxy_close <= 0 or item.proxy_close::text in ('NaN','Infinity','-Infinity')
      or item.proxy_price_date is null or item.announcement_id is null or item.announcement_id <= 0
      or item.published_at is null or item.published_at > p_fetched_at or item.revision_at is null
      or item.proxy_price_date - (case when extract(isodow from item.proxy_price_date) = 1 then 3 else 1 end) <> item.anchor_date
      or extract(isodow from item.proxy_price_date) not between 1 and 5 then raise exception 'Invalid NTA anchor'; end if;
    select * into source from kernel_price_anchors where id = item.source_id;
    if found then
      if source.instrument_id <> p_instrument_id or source.derived_from_anchor_id is not null
        or source.anchor_date <> item.anchor_date or source.kernel_unit_price <> item.kernel_unit_price
        or source.created_by_user_id <> item.created_by_user_id or source.created_at <> item.revision_at then
        raise exception 'NTA refresh cannot change actual anchors'; end if;
      if source.proxy_value_type <> 'nta' or source.proxy_announcement_id is distinct from item.announcement_id then
        insert into kernel_price_anchors(instrument_id,anchor_date,kernel_unit_price,proxy_symbol,proxy_currency,
          proxy_close,proxy_price_date,proxy_fetched_at,created_by_user_id,proxy_value_type,
          proxy_announcement_id,proxy_published_at,derived_from_anchor_id)
        values(p_instrument_id,item.anchor_date,item.kernel_unit_price,'USF.NZ','NZD',item.proxy_close,
          item.proxy_price_date,p_fetched_at,item.created_by_user_id,'nta',item.announcement_id,item.published_at,item.source_id)
        on conflict (derived_from_anchor_id,proxy_announcement_id) where derived_from_anchor_id is not null do nothing;
      end if;
    else
      insert into kernel_price_anchors(id,instrument_id,anchor_date,kernel_unit_price,proxy_symbol,proxy_currency,
        proxy_close,proxy_price_date,proxy_fetched_at,created_by_user_id,created_at,proxy_value_type,proxy_announcement_id,proxy_published_at)
      values(item.source_id,p_instrument_id,item.anchor_date,item.kernel_unit_price,'USF.NZ','NZD',item.proxy_close,
        item.proxy_price_date,p_fetched_at,item.created_by_user_id,item.revision_at,'nta',item.announcement_id,item.published_at)
      on conflict (instrument_id,anchor_date,kernel_unit_price,proxy_close,proxy_price_date,proxy_announcement_id)
        where derived_from_anchor_id is null and proxy_value_type='nta' do nothing;
    end if;
  end loop;
  -- Capture exact-price changes before replacing them.
  select min(a.anchor_date) into exact_change_date from
    (select distinct on(anchor_date) anchor_date,kernel_unit_price from kernel_price_anchors
      where instrument_id=p_instrument_id and derived_from_anchor_id is null order by anchor_date,created_at desc,id desc) a
    where not exists(select 1 from instrument_prices p where p.instrument_id=p_instrument_id
      and p.provider='Kernel Anchor' and p.price_date=a.anchor_date and p.close_price=a.kernel_unit_price);
  -- Latest actual revision, never the conversion timestamp, wins each exact date.
  insert into instrument_prices(instrument_id,price_date,close_price,currency,provider,source_symbol,is_adjusted,is_estimated,fetched_at)
  select p_instrument_id,a.anchor_date,a.kernel_unit_price,'NZD','Kernel Anchor',target.symbol,false,false,p_fetched_at
  from (select distinct on(anchor_date) anchor_date,kernel_unit_price from kernel_price_anchors
    where instrument_id = p_instrument_id and derived_from_anchor_id is null order by anchor_date,created_at desc,id desc) a
  on conflict(instrument_id,provider,price_date) do update set close_price = excluded.close_price, updated_at = now()
    where instrument_prices.close_price is distinct from excluded.close_price;
  if exists(select 1 from jsonb_to_recordset(p_estimates) as e(price_date date,close_price numeric)
    where e.price_date is null or e.price_date < p_from_date or e.close_price is null or e.close_price <= 0
      or e.close_price::text in ('NaN','Infinity','-Infinity'))
    or (select count(*) <> count(distinct price_date) from jsonb_to_recordset(p_estimates) as e(price_date date)) then
    raise exception 'Invalid NTA estimates'; end if;
  select min(price_date),count(*) into change_date,changed_count from (
    select p.price_date from instrument_prices p where p.instrument_id = p_instrument_id
      and p.provider in ('Kernel Estimate (USF.NZ)','Kernel Estimate (USF NTA)') and p.is_estimated
      and (p.price_date < p_from_date or p.provider = 'Kernel Estimate (USF.NZ)'
        or not exists(select 1 from jsonb_to_recordset(p_estimates) as e(price_date date,close_price numeric)
          where e.price_date = p.price_date and round(e.close_price,10) = p.close_price))
    union all
    select e.price_date from jsonb_to_recordset(p_estimates) as e(price_date date,close_price numeric)
      where not exists(select 1 from kernel_price_anchors a where a.instrument_id=p_instrument_id and a.anchor_date=e.price_date)
      and not exists(select 1 from instrument_prices p where p.instrument_id=p_instrument_id
        and p.provider='Kernel Estimate (USF NTA)' and p.price_date=e.price_date and p.close_price=round(e.close_price,10))
  ) changes;
  change_date := least(change_date,exact_change_date);
  delete from instrument_prices p where p.instrument_id=p_instrument_id and p.is_estimated
    and p.provider in ('Kernel Estimate (USF.NZ)','Kernel Estimate (USF NTA)')
    and (p.provider='Kernel Estimate (USF.NZ)' or not exists(select 1 from jsonb_to_recordset(p_estimates) as e(price_date date)
      where e.price_date=p.price_date));
  insert into instrument_prices(instrument_id,price_date,close_price,currency,provider,source_symbol,is_adjusted,is_estimated,fetched_at)
  select p_instrument_id,e.price_date,round(e.close_price,10),'NZD','Kernel Estimate (USF NTA)','USF.NZ',false,true,p_fetched_at
  from jsonb_to_recordset(p_estimates) as e(price_date date,close_price numeric)
  where not exists(select 1 from kernel_price_anchors a where a.instrument_id=p_instrument_id and a.anchor_date=e.price_date)
  on conflict(instrument_id,provider,price_date) do update set close_price=excluded.close_price,fetched_at=excluded.fetched_at,updated_at=now()
    where instrument_prices.close_price is distinct from excluded.close_price;
  if first_anchor then update instruments set price_update_enabled=true where id=p_instrument_id; end if;
  insert into kernel_nta_refresh_state(instrument_id,pending_snapshot_from) values(p_instrument_id,change_date)
  on conflict(instrument_id) do update set pending_snapshot_from=least(kernel_nta_refresh_state.pending_snapshot_from,excluded.pending_snapshot_from),refresh_token=gen_random_uuid()
  returning * into state;
  if change_date is not null then delete from dashboard_instrument_quotes where instrument_id=p_instrument_id; end if;
  return jsonb_build_object('changed_from',change_date,'changed_count',changed_count,'pending_snapshot_from',state.pending_snapshot_from,'refresh_token',state.refresh_token);
end $$;
revoke all on function public.refresh_kernel_nta(uuid,date,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.refresh_kernel_nta(uuid,date,timestamptz,jsonb,jsonb) to service_role;

create function public.complete_kernel_nta_snapshots(p_instrument_id uuid,p_refresh_token uuid) returns void
language sql security definer set search_path=public as $$
  update kernel_nta_refresh_state set pending_snapshot_from=null where instrument_id=p_instrument_id and refresh_token=p_refresh_token;
$$;
revoke all on function public.complete_kernel_nta_snapshots(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_kernel_nta_snapshots(uuid,uuid) to service_role;

update public.instruments set description='Kernel unit prices estimated from published USF per-unit NTA relative to actual Kernel anchors.',
  notes='USF NTA date maps to the preceding weekday Kernel valuation date.' where symbol='KERNEL_SP500_UNHEDGED';

-- Extend the existing single-statement backup without changing its numeric encoding.
alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_nta;
create function public.export_ledger_backup(excluded_job_run_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
  select public.export_ledger_backup_before_nta(excluded_job_run_id) || jsonb_build_object(
    'kernel_nta_refresh_state',coalesce((select jsonb_agg(to_jsonb(s) order by instrument_id) from kernel_nta_refresh_state s),'[]'::jsonb));
$$;
revoke all on function public.export_ledger_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
notify pgrst,'reload schema';
commit;
