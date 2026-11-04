begin;

alter table public.kernel_price_anchors
  alter column proxy_close drop not null,
  alter column proxy_price_date drop not null,
  alter column proxy_fetched_at drop not null,
  add column actual_source text,
  add column actual_price_precision integer;
alter table public.kernel_price_anchors drop constraint kernel_price_anchors_proxy_value_type_check;
alter table public.kernel_price_anchors drop constraint kernel_nta_metadata_check;
alter table public.kernel_price_anchors add constraint kernel_anchor_reference_shape check (
  (proxy_value_type = 'pending' and derived_from_anchor_id is null
    and proxy_close is null and proxy_price_date is null and proxy_fetched_at is null
    and proxy_announcement_id is null and proxy_published_at is null
    and actual_source is not null and actual_price_precision is not null)
  or (proxy_value_type = 'open' and proxy_close is not null and proxy_price_date is not null and proxy_fetched_at is not null)
  or (proxy_value_type = 'nta' and proxy_close is not null and proxy_price_date is not null and proxy_fetched_at is not null
    and proxy_announcement_id is not null and proxy_announcement_id > 0 and proxy_published_at is not null
    and extract(isodow from proxy_price_date) between 1 and 5
    and proxy_price_date - case when extract(isodow from proxy_price_date)=1 then 3 else 1 end = anchor_date)
);
alter table public.kernel_price_anchors add constraint kernel_anchor_actual_metadata check (
  (actual_source is null or length(btrim(actual_source)) between 1 and 200)
  and (actual_price_precision is null or (actual_price_precision between 0 and 10
    and round(kernel_unit_price,actual_price_precision)=kernel_unit_price))
);
create unique index kernel_pending_actual_retry_key on public.kernel_price_anchors(
  instrument_id,anchor_date,kernel_unit_price,actual_source,actual_price_precision)
  where derived_from_anchor_id is null and proxy_value_type='pending';
alter table public.kernel_nta_refresh_state add column nta_observations jsonb not null default '{}'::jsonb
  check(jsonb_typeof(nta_observations)='object');

create or replace function public.list_kernel_nta_anchors() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('kernel_unit_price',a.kernel_unit_price::text,
    'proxy_close',a.proxy_close::text,'pairing_status',case when a.proxy_value_type='nta' or exists(
      select 1 from kernel_price_anchors r where r.derived_from_anchor_id=a.id and r.proxy_value_type='nta')
      then 'paired' else 'pending' end) order by a.anchor_date desc,a.created_at desc,a.id desc),'[]'::jsonb)
  from kernel_price_anchors a;
$$;

create function public.save_kernel_actual_anchor(
  p_instrument_id uuid,p_anchor_date date,p_kernel_unit_price numeric,p_actual_source text,
  p_actual_price_precision integer,p_created_by_user_id uuid,p_fetched_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.instruments%rowtype; root public.kernel_price_anchors%rowtype;
  existing public.instrument_prices%rowtype; state public.kernel_nta_refresh_state%rowtype;
  next_date date; changed_from date; first_anchor boolean; root_json jsonb;
begin
  -- Match transaction/acquisition writers: global ledger lock precedes target locks.
  perform 1 from ledger_write_state where id for update;
  select * into target from instruments where id=p_instrument_id for update;
  if not found or target.exchange is distinct from 'KERNEL' or target.currency is distinct from 'NZD'
    or target.price_source is distinct from 'kernel_estimate' or target.price_source_symbol is distinct from 'USF.NZ'
    or target.price_source_exchange is distinct from 'NZX' then raise exception 'Invalid Kernel target'; end if;
  if p_anchor_date is null or p_fetched_at is null or p_kernel_unit_price is null or p_kernel_unit_price<=0
    or p_kernel_unit_price::text in ('NaN','Infinity','-Infinity') or p_kernel_unit_price>=1e18
    or p_actual_source is null or length(btrim(p_actual_source)) not between 1 and 200
    or p_actual_price_precision is null or p_actual_price_precision not between 0 and 10
    or round(p_kernel_unit_price,p_actual_price_precision)<>p_kernel_unit_price
    or p_created_by_user_id is null then raise exception 'Invalid actual Kernel anchor'; end if;
  select * into root from kernel_price_anchors where instrument_id=p_instrument_id and anchor_date=p_anchor_date
    and kernel_unit_price=p_kernel_unit_price and actual_source=btrim(p_actual_source)
    and actual_price_precision=p_actual_price_precision and derived_from_anchor_id is null
    order by created_at desc,id desc limit 1;
  if not found then
    -- An equal observation with fewer displayed decimals must not demote a known precise root.
    select * into root from kernel_price_anchors where instrument_id=p_instrument_id and anchor_date=p_anchor_date
      and kernel_unit_price=p_kernel_unit_price and actual_price_precision>p_actual_price_precision and derived_from_anchor_id is null
      order by created_at desc,id desc limit 1;
  end if;
  if not found then
    if exists(select 1 from instrument_prices where instrument_id=p_instrument_id and price_date=p_anchor_date
      and provider='manual' and close_price<>p_kernel_unit_price) then raise exception 'Actual anchor conflicts with a manual price'; end if;
    select * into existing from instrument_prices where instrument_id=p_instrument_id and price_date=p_anchor_date and provider='Kernel Anchor';
    if found and (existing.is_estimated or (existing.close_price<>p_kernel_unit_price and
      greatest(0,length(split_part(rtrim(rtrim(existing.close_price::text,'0'),'.'),'.',2)),
        (select a.actual_price_precision from kernel_price_anchors a where a.instrument_id=p_instrument_id and a.anchor_date=p_anchor_date
          and a.derived_from_anchor_id is null order by a.created_at desc,a.id desc limit 1))>p_actual_price_precision)) then
      raise exception 'Actual anchor conflicts with a more precise or invalid existing price'; end if;
    select not exists(select 1 from kernel_price_anchors where instrument_id=p_instrument_id) into first_anchor;
    insert into kernel_price_anchors(instrument_id,anchor_date,kernel_unit_price,proxy_symbol,proxy_currency,
      proxy_value_type,created_by_user_id,actual_source,actual_price_precision)
    values(p_instrument_id,p_anchor_date,p_kernel_unit_price,'USF.NZ','NZD','pending',p_created_by_user_id,btrim(p_actual_source),p_actual_price_precision)
    returning * into root;
    insert into instrument_prices(instrument_id,price_date,close_price,currency,provider,source_symbol,is_adjusted,is_estimated,fetched_at)
      values(p_instrument_id,p_anchor_date,p_kernel_unit_price,'NZD','Kernel Anchor',target.symbol,false,false,p_fetched_at)
      on conflict(instrument_id,provider,price_date) do update set close_price=excluded.close_price,
        fetched_at=excluded.fetched_at,updated_at=now() where instrument_prices.close_price is distinct from excluded.close_price;
    select min(anchor_date) into next_date from kernel_price_anchors where instrument_id=p_instrument_id
      and derived_from_anchor_id is null and anchor_date>p_anchor_date;
    delete from instrument_prices where instrument_id=p_instrument_id and is_estimated
      and provider in ('Kernel Estimate (USF NTA)','Kernel Estimate (USF.NZ)')
      and price_date>=p_anchor_date and (next_date is null or price_date<next_date);
    changed_from := p_anchor_date;
    if first_anchor then update instruments set price_update_enabled=true where id=p_instrument_id; end if;
    delete from dashboard_instrument_quotes where instrument_id=p_instrument_id;
  end if;
  insert into kernel_nta_refresh_state(instrument_id,pending_snapshot_from) values(p_instrument_id,changed_from)
    on conflict(instrument_id) do update set pending_snapshot_from=least(kernel_nta_refresh_state.pending_snapshot_from,excluded.pending_snapshot_from),
      refresh_token=case when changed_from is null then kernel_nta_refresh_state.refresh_token else gen_random_uuid() end
    returning * into state;
  select value into root_json from jsonb_array_elements(list_kernel_nta_anchors()) where value->>'id'=root.id::text;
  return jsonb_build_object('anchor',root_json,'pending_snapshot_from',state.pending_snapshot_from,'refresh_token',state.refresh_token);
end $$;
revoke all on function public.save_kernel_actual_anchor(uuid,date,numeric,text,integer,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.save_kernel_actual_anchor(uuid,date,numeric,text,integer,uuid,timestamptz) to service_role;

-- This version accepts persisted roots only. A stale writer cannot create an actual root through refresh.
create or replace function public.refresh_kernel_nta(
  p_instrument_id uuid,p_from_date date,p_fetched_at timestamptz,p_anchors jsonb,p_estimates jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.instruments%rowtype; source public.kernel_price_anchors%rowtype;
  latest public.kernel_price_anchors%rowtype; item record; estimate record; winner record;
  change_date date; changed_count integer:=0; state public.kernel_nta_refresh_state%rowtype;
  observation record; observations jsonb; previous jsonb;
begin
  perform 1 from ledger_write_state where id for update;
  select * into target from instruments where id=p_instrument_id for update;
  if not found or target.exchange is distinct from 'KERNEL' or target.currency is distinct from 'NZD'
    or target.price_source is distinct from 'kernel_estimate' or target.price_source_symbol is distinct from 'USF.NZ'
    or target.price_source_exchange is distinct from 'NZX' then raise exception 'Invalid Kernel NTA target'; end if;
  if p_from_date is null or p_fetched_at is null or jsonb_typeof(p_anchors) is distinct from 'array'
    or jsonb_typeof(p_estimates) is distinct from 'array' then raise exception 'Invalid NTA refresh payload'; end if;
  if jsonb_array_length(p_anchors)=0 or (select count(*)<>count(distinct a.source_id) from jsonb_to_recordset(p_anchors) a(source_id uuid))
    or exists(select 1 from kernel_price_anchors a where a.instrument_id=p_instrument_id and a.derived_from_anchor_id is null
      and not exists(select 1 from jsonb_to_recordset(p_anchors) j(source_id uuid) where j.source_id=a.id)) then
    raise exception 'Stale Kernel anchor set; retry refresh'; end if;
  for item in select * from jsonb_to_recordset(p_anchors) a(source_id uuid,anchor_date date,kernel_unit_price numeric,
    proxy_close numeric,proxy_price_date date,announcement_id bigint,published_at timestamptz,created_by_user_id uuid,revision_at timestamptz)
  loop
    select * into source from kernel_price_anchors where id=item.source_id;
    if not found or source.instrument_id<>p_instrument_id or source.derived_from_anchor_id is not null
      or source.anchor_date is distinct from item.anchor_date or source.kernel_unit_price is distinct from item.kernel_unit_price
      or source.created_by_user_id is distinct from item.created_by_user_id or source.created_at is distinct from item.revision_at
      or source.anchor_date<p_from_date then raise exception 'NTA refresh cannot change actual anchors'; end if;
    select * into latest from kernel_price_anchors where (id=source.id or derived_from_anchor_id=source.id) and proxy_value_type='nta'
      order by proxy_published_at desc,proxy_announcement_id desc limit 1;
    if item.proxy_close is null then
      if item.proxy_price_date is not null or item.announcement_id is not null or item.published_at is not null
        or latest.id is not null then raise exception 'Incomplete or stale NTA reference'; end if;
      continue;
    end if;
    if item.proxy_close<=0 or item.proxy_close::text in ('NaN','Infinity','-Infinity') or item.proxy_close>=1e18
      or round(item.proxy_close,10)<>item.proxy_close or item.proxy_price_date is null or item.announcement_id is null or item.announcement_id<=0
      or item.published_at is null or item.published_at>p_fetched_at
      or extract(isodow from item.proxy_price_date) not between 1 and 5
      or item.proxy_price_date-(case when extract(isodow from item.proxy_price_date)=1 then 3 else 1 end)<>source.anchor_date then
      raise exception 'Invalid NTA reference'; end if;
    if latest.id is not null and (item.published_at,item.announcement_id)<(latest.proxy_published_at,latest.proxy_announcement_id) then
      raise exception 'Stale Kernel NTA reference; retry refresh'; end if;
    if exists(select 1 from kernel_price_anchors where (id=source.id or derived_from_anchor_id=source.id)
      and proxy_announcement_id=item.announcement_id and (proxy_close is distinct from item.proxy_close
        or proxy_price_date is distinct from item.proxy_price_date or proxy_published_at is distinct from item.published_at)) then
      raise exception 'Inconsistent NTA announcement'; end if;
    if source.proxy_value_type<>'nta' or source.proxy_announcement_id<>item.announcement_id then
      insert into kernel_price_anchors(instrument_id,anchor_date,kernel_unit_price,proxy_symbol,proxy_currency,proxy_close,proxy_price_date,
        proxy_fetched_at,created_by_user_id,proxy_value_type,proxy_announcement_id,proxy_published_at,derived_from_anchor_id)
      values(p_instrument_id,source.anchor_date,source.kernel_unit_price,'USF.NZ','NZD',item.proxy_close,item.proxy_price_date,p_fetched_at,
        source.created_by_user_id,'nta',item.announcement_id,item.published_at,source.id)
      on conflict(derived_from_anchor_id,proxy_announcement_id) where derived_from_anchor_id is not null do nothing;
    end if;
  end loop;
  if (select count(*)<>count(distinct e.price_date) from jsonb_to_recordset(p_estimates) e(price_date date)) then
    raise exception 'Duplicate NTA estimate date'; end if;
  for estimate in select * from jsonb_to_recordset(p_estimates) e(price_date date,close_price numeric,nta_date date,unit_nta numeric,announcement_id bigint,published_at timestamptz)
  loop
    select a.* into winner from jsonb_to_recordset(p_anchors) a(source_id uuid,anchor_date date,kernel_unit_price numeric,proxy_close numeric,
      proxy_price_date date,revision_at timestamptz) where a.anchor_date<=estimate.price_date order by a.anchor_date desc,a.revision_at desc,a.source_id desc limit 1;
    if winner.source_id is null or winner.proxy_close is null or winner.anchor_date=estimate.price_date
      or estimate.price_date is null or estimate.price_date<p_from_date or estimate.close_price is null or estimate.close_price<=0
      or estimate.close_price::text in ('NaN','Infinity','-Infinity') or estimate.nta_date is null or estimate.unit_nta is null
      or estimate.unit_nta<=0 or estimate.unit_nta::text in ('NaN','Infinity','-Infinity')
      or estimate.unit_nta>=1e18 or round(estimate.unit_nta,10)<>estimate.unit_nta
      or estimate.announcement_id is null or estimate.announcement_id<=0 or estimate.published_at is null or estimate.published_at>p_fetched_at
      or extract(isodow from estimate.nta_date) not between 1 and 5
      or estimate.nta_date-(case when extract(isodow from estimate.nta_date)=1 then 3 else 1 end)<>estimate.price_date
      or estimate.nta_date<=winner.proxy_price_date
      or round(winner.kernel_unit_price*estimate.unit_nta/winner.proxy_close,10)<>estimate.close_price then
      raise exception 'Invalid NTA estimate or pending actual interval'; end if;
  end loop;
  -- Protect target announcements as well as root references against stale provider responses.
  select coalesce(s.nta_observations,'{}'::jsonb) into observations from kernel_nta_refresh_state s where instrument_id=p_instrument_id;
  observations := coalesce(observations,'{}'::jsonb);
  for observation in
    select a.proxy_price_date as nta_date,a.proxy_close as unit_nta,a.announcement_id,a.published_at
      from jsonb_to_recordset(p_anchors) a(proxy_price_date date,proxy_close numeric,announcement_id bigint,published_at timestamptz) where a.proxy_close is not null
    union
    select e.nta_date,e.unit_nta,e.announcement_id,e.published_at
      from jsonb_to_recordset(p_estimates) e(nta_date date,unit_nta numeric,announcement_id bigint,published_at timestamptz)
  loop
    previous := observations->observation.nta_date::text;
    if previous is not null then
      if (observation.published_at,observation.announcement_id)<((previous->>'published_at')::timestamptz,(previous->>'announcement_id')::bigint) then
        raise exception 'Stale target NTA announcement; retry refresh'; end if;
      if observation.announcement_id=(previous->>'announcement_id')::bigint and
        (observation.unit_nta is distinct from (previous->>'unit_nta')::numeric or observation.published_at is distinct from (previous->>'published_at')::timestamptz) then
        raise exception 'Inconsistent target NTA announcement'; end if;
    end if;
    observations := observations || jsonb_build_object(observation.nta_date::text,jsonb_build_object(
      'unit_nta',observation.unit_nta::text,'announcement_id',observation.announcement_id,'published_at',observation.published_at));
  end loop;
  select min(price_date),count(*) into change_date,changed_count from (
    select p.price_date from instrument_prices p where p.instrument_id=p_instrument_id and p.is_estimated
      and p.provider in ('Kernel Estimate (USF.NZ)','Kernel Estimate (USF NTA)')
      and (p.provider='Kernel Estimate (USF.NZ)' or not exists(select 1 from jsonb_to_recordset(p_estimates) e(price_date date,close_price numeric)
        where e.price_date=p.price_date and e.close_price=p.close_price))
    union all
    select e.price_date from jsonb_to_recordset(p_estimates) e(price_date date,close_price numeric) where not exists(
      select 1 from instrument_prices p where p.instrument_id=p_instrument_id and p.provider='Kernel Estimate (USF NTA)'
        and p.price_date=e.price_date and (p.close_price=e.close_price or not p.is_estimated))
  ) changes;
  delete from instrument_prices p where p.instrument_id=p_instrument_id and p.is_estimated
    and p.provider in ('Kernel Estimate (USF.NZ)','Kernel Estimate (USF NTA)')
    and (p.provider='Kernel Estimate (USF.NZ)' or not exists(select 1 from jsonb_to_recordset(p_estimates) e(price_date date) where e.price_date=p.price_date));
  insert into instrument_prices(instrument_id,price_date,close_price,currency,provider,source_symbol,is_adjusted,is_estimated,fetched_at)
    select p_instrument_id,e.price_date,e.close_price,'NZD','Kernel Estimate (USF NTA)','USF.NZ',false,true,p_fetched_at
      from jsonb_to_recordset(p_estimates) e(price_date date,close_price numeric)
    on conflict(instrument_id,provider,price_date) do update set close_price=excluded.close_price,fetched_at=excluded.fetched_at,updated_at=now()
      where instrument_prices.is_estimated and instrument_prices.close_price is distinct from excluded.close_price;
  insert into kernel_nta_refresh_state(instrument_id,pending_snapshot_from,nta_observations) values(p_instrument_id,change_date,observations)
    on conflict(instrument_id) do update set pending_snapshot_from=least(kernel_nta_refresh_state.pending_snapshot_from,excluded.pending_snapshot_from),
      nta_observations=excluded.nta_observations,
      refresh_token=case when change_date is null then kernel_nta_refresh_state.refresh_token else gen_random_uuid() end returning * into state;
  if change_date is not null then delete from dashboard_instrument_quotes where instrument_id=p_instrument_id; end if;
  return jsonb_build_object('changed_from',change_date,'changed_count',changed_count,'pending_snapshot_from',state.pending_snapshot_from,'refresh_token',state.refresh_token);
end $$;

-- Full rows and exact numeric fields are already exported by the allowlisted exporter.
alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_pending_kernel;
revoke all on function public.export_ledger_backup_before_pending_kernel(uuid) from public,anon,authenticated,service_role;
create function public.export_ledger_backup(excluded_job_run_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
  select public.export_ledger_backup_before_pending_kernel(excluded_job_run_id) || jsonb_build_object('_kernel_anchor_schema','independent-actual-v1');
$$;
revoke all on function public.export_ledger_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
notify pgrst,'reload schema';
commit;
