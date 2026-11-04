-- Durable logical work is distinct from recoverable, expiring attempt ownership.
create table public.price_acquisition_state (
  source text not null check (length(btrim(source)) > 0),
  instrument_id uuid not null references public.instruments(id),
  query_kind text not null check (query_kind in ('latest_quote','daily_history')),
  target_date date not null,
  status text not null default 'pending' check (status in ('pending','retry','resolved','needs_attention')),
  attempts integer not null default 0 check (attempts >= 0),
  transient_attempts integer not null default 0,
  daily_attempts integer not null default 0,
  last_daily_attempt_at timestamptz,
  next_attempt_at timestamptz default now(),
  last_attempt_at timestamptz,
  last_outcome text,
  reason text,
  lease_token uuid unique,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source,instrument_id,query_kind,target_date),
  check ((lease_token is null) = (lease_expires_at is null)),
  check (query_kind <> 'latest_quote' or target_date = '1970-01-01')
);
create index price_acquisition_due_idx on public.price_acquisition_state(next_attempt_at,last_attempt_at,target_date)
  where status in ('pending','retry');
create table public.price_acquisition_attempts (
  lease_token uuid primary key,
  source text not null, instrument_id uuid not null references public.instruments(id),
  query_kind text not null, target_date date not null,
  started_at timestamptz not null, finished_at timestamptz,
  outcome text not null, reason text
);
create table public.instrument_price_revisions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id),
  provider text not null, price_date date not null,
  lease_token uuid not null,
  before_value jsonb, after_value jsonb not null,
  created_at timestamptz not null default now()
);
create index instrument_price_revisions_identity_idx on public.instrument_price_revisions(instrument_id,price_date,created_at);
alter table public.price_acquisition_state enable row level security;
alter table public.price_acquisition_attempts enable row level security;
alter table public.instrument_price_revisions enable row level security;
revoke all on public.price_acquisition_state,public.price_acquisition_attempts,public.instrument_price_revisions from public,anon,authenticated;
grant select on public.price_acquisition_state,public.price_acquisition_attempts,public.instrument_price_revisions to service_role;

create function public.ensure_price_acquisition(source text,instrument_id uuid,query_kind text,target_date date)
returns void language sql security definer set search_path = '' as $$
  insert into public.price_acquisition_state(source,instrument_id,query_kind,target_date)
  values(source,instrument_id,query_kind,target_date) on conflict do nothing;
$$;

create function public.claim_price_acquisition(source text,instrument_id uuid,query_kind text,target_date date,lease_seconds integer default 120,force_retry boolean default false)
returns setof public.price_acquisition_state language plpgsql security definer set search_path = '' as $$
declare claimed public.price_acquisition_state; previous_token uuid;
begin
  select s.lease_token into previous_token from public.price_acquisition_state s
    where s.source=claim_price_acquisition.source and s.instrument_id=claim_price_acquisition.instrument_id
      and s.query_kind=claim_price_acquisition.query_kind and s.target_date=claim_price_acquisition.target_date for update;
  update public.price_acquisition_state s set
    lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+make_interval(secs=>greatest(1,least(lease_seconds,300))),
    attempts=s.attempts+1,last_attempt_at=clock_timestamp(),updated_at=clock_timestamp(),
    transient_attempts=case when force_retry and s.status='needs_attention' then 0 else s.transient_attempts end,
    daily_attempts=case when force_retry and s.status='needs_attention' then 0 else s.daily_attempts end
  where s.source=claim_price_acquisition.source and s.instrument_id=claim_price_acquisition.instrument_id
    and s.query_kind=claim_price_acquisition.query_kind and s.target_date=claim_price_acquisition.target_date
    and exists(select 1 from public.instruments i where i.id=s.instrument_id and i.price_update_enabled
      and s.source=case when i.price_source='custom' and i.price_source_symbol in ('FS_NASDAQ_100','FS_TOTAL_WORLD','FS_US_500') then 'fundrock' else i.price_source end)
    and (s.lease_expires_at is null or s.lease_expires_at <= clock_timestamp())
    and not exists(select 1 from public.price_acquisition_state cooling where cooling.source=s.source
      and cooling.reason='SOURCE_COOLDOWN' and cooling.next_attempt_at>clock_timestamp())
    and ((force_retry and (s.last_attempt_at is null or s.last_attempt_at <= clock_timestamp()-interval '60 seconds'))
      or (s.status in ('pending','retry') and s.next_attempt_at <= clock_timestamp())
      or (s.query_kind='latest_quote' and s.status='resolved' and s.next_attempt_at <= clock_timestamp()))
  returning s.* into claimed;
  if found then
    update public.price_acquisition_attempts set outcome='lease_expired',finished_at=clock_timestamp() where lease_token=previous_token and finished_at is null;
    insert into public.price_acquisition_attempts(lease_token,source,instrument_id,query_kind,target_date,started_at,outcome)
      values(claimed.lease_token,claimed.source,claimed.instrument_id,claimed.query_kind,claimed.target_date,claimed.last_attempt_at,'started');
    return next claimed;
  end if;
end;
$$;

create function public.complete_price_acquisition(lease_token uuid,outcome text,reason text default null,retry_after_seconds integer default 0,prices jsonb default '[]')
returns boolean language plpgsql security definer set search_path = '' as $$
declare work public.price_acquisition_state; item jsonb; existing public.instrument_prices; saved public.instrument_prices;
  next_time timestamptz; next_status text; transient_count integer; daily_count integer; is_daily boolean;
begin
  if outcome not in ('success','failed','unavailable','unsupported') then raise exception 'Invalid acquisition outcome'; end if;
  -- Follow the ledger writer lock order before taking work/price rows.
  perform 1 from public.ledger_write_state where id for update;
  select * into work from public.price_acquisition_state s where s.lease_token=complete_price_acquisition.lease_token for update;
  if not found or work.lease_expires_at <= clock_timestamp() then return false; end if;
  if not exists(select 1 from public.instruments i where i.id=work.instrument_id and i.price_update_enabled
    and work.source=case when i.price_source='custom' and i.price_source_symbol in ('FS_NASDAQ_100','FS_TOTAL_WORLD','FS_US_500') then 'fundrock' else i.price_source end) then return false; end if;
  if outcome <> 'success' and jsonb_array_length(prices)>0 then raise exception 'Only successful items can publish prices'; end if;
  for item in select value from jsonb_array_elements(prices) loop
    if work.query_kind <> 'daily_history' or (item->>'instrumentId')::uuid <> work.instrument_id or (item->>'priceDate')::date <> work.target_date then
      raise exception 'Acquisition price identity mismatch';
    end if;
    if lower(btrim(item->>'provider'))='manual' or item ? 'sourceTransactionId' then raise exception 'Protected manual price'; end if;
    if not exists(select 1 from public.instruments i where i.id=work.instrument_id and i.currency=item->>'currency'
      and (item->>'sourceSymbol' is null or i.price_source_symbol=item->>'sourceSymbol')) then
      raise exception 'Source configuration changed during acquisition';
    end if;
    select * into existing from public.instrument_prices p where p.instrument_id=work.instrument_id
      and p.provider=item->>'provider' and p.price_date=work.target_date for update;
    if found and (existing.source_transaction_id is not null or existing.provider='manual'
      or coalesce(existing.fetched_at,'-infinity') >= (item->>'fetchedAt')::timestamptz) then continue; end if;
    if (item->>'fetchedAt')::timestamptz is null then raise exception 'Acquisition instant required'; end if;
    if existing.id is not null and existing.close_price=(item->>'closePrice')::numeric
      and existing.currency=item->>'currency' and existing.is_estimated=coalesce((item->>'isEstimated')::boolean,false)
      and existing.is_adjusted=coalesce((item->>'isAdjusted')::boolean,false) then
      update public.instrument_prices set fetched_at=(item->>'fetchedAt')::timestamptz where id=existing.id;
      continue;
    end if;
    insert into public.instrument_prices(instrument_id,price_date,close_price,currency,provider,source_symbol,is_adjusted,is_estimated,fetched_at)
    values(work.instrument_id,work.target_date,(item->>'closePrice')::numeric,item->>'currency',item->>'provider',item->>'sourceSymbol',
      coalesce((item->>'isAdjusted')::boolean,false),coalesce((item->>'isEstimated')::boolean,false),(item->>'fetchedAt')::timestamptz)
    on conflict (instrument_id,provider,price_date) do update set close_price=excluded.close_price,currency=excluded.currency,
      source_symbol=excluded.source_symbol,is_adjusted=excluded.is_adjusted,is_estimated=excluded.is_estimated,fetched_at=excluded.fetched_at
    returning * into saved;
    -- Decimal fields are text before JSON encoding; no client numeric round trip.
    insert into public.instrument_price_revisions(instrument_id,provider,price_date,lease_token,before_value,after_value)
    values(work.instrument_id,saved.provider,saved.price_date,complete_price_acquisition.lease_token,
      case when existing.id is null then null else to_jsonb(existing)||jsonb_build_object('close_price',existing.close_price::text) end,
      to_jsonb(saved)||jsonb_build_object('close_price',saved.close_price::text));
  end loop;
  transient_count := work.transient_attempts+1;
  is_daily := work.query_kind='daily_history' and (outcome='unavailable' or transient_count>3);
  daily_count := work.daily_attempts + case when is_daily and (work.last_daily_attempt_at is null or work.last_daily_attempt_at <= clock_timestamp()-interval '1 day') then 1 else 0 end;
  if outcome='success' then next_status:='resolved'; next_time:=case when work.query_kind='latest_quote' then clock_timestamp()+interval '5 minutes' end;
  elsif outcome='unsupported' or (is_daily and daily_count>=7) then next_status:='needs_attention'; next_time:=null;
  else next_status:='retry'; next_time:=clock_timestamp()+make_interval(secs=>greatest(retry_after_seconds,
    case when is_daily then 86400 else least(3600,ceil((case when transient_count=1 then 300 when transient_count=2 then 900 else 3600 end)*(1+random()*0.1))::integer) end)); end if;
  update public.price_acquisition_attempts a set finished_at=clock_timestamp(),outcome=complete_price_acquisition.outcome,reason=left(complete_price_acquisition.reason,100)
    where a.lease_token=complete_price_acquisition.lease_token;
  update public.price_acquisition_state s set status=next_status,next_attempt_at=next_time,last_outcome=outcome,reason=left(complete_price_acquisition.reason,100),
    transient_attempts=case when outcome='success' then 0 else transient_count end,
    daily_attempts=case when outcome='success' then 0 else daily_count end,
    last_daily_attempt_at=case when is_daily then clock_timestamp() else s.last_daily_attempt_at end,
    lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where s.lease_token=complete_price_acquisition.lease_token;
  return true;
end;
$$;

create function public.list_due_price_gaps(through_date date,batch_limit integer default 100)
returns table(source text,instrument_id uuid,target_date date,source_symbol text,currency text,source_exchange text)
language sql stable security definer set search_path = '' as $$
  select s.source,s.instrument_id,s.target_date,i.price_source_symbol,i.currency,coalesce(i.price_source_exchange,i.exchange)
  from public.price_acquisition_state s join public.instruments i on i.id=s.instrument_id
  where s.query_kind='daily_history' and s.target_date<=through_date and s.status in ('pending','retry')
    and s.next_attempt_at<=now() and (s.lease_expires_at is null or s.lease_expires_at<=now())
    and i.price_source_symbol is not null and i.price_update_enabled
    and s.source=case when i.price_source='custom' and i.price_source_symbol in ('FS_NASDAQ_100','FS_TOTAL_WORLD','FS_US_500') then 'fundrock' else i.price_source end
  order by s.next_attempt_at,s.last_attempt_at nulls first,s.target_date,s.source,s.instrument_id
  limit greatest(1,least(batch_limit,500));
$$;
revoke all on function public.list_due_price_gaps(date,integer) from public,anon,authenticated;
grant execute on function public.list_due_price_gaps(date,integer) to service_role;

create function public.retry_historical_price_gaps() returns void
language sql security definer set search_path = '' as $$
  update public.price_acquisition_state set status='retry',transient_attempts=0,daily_attempts=0,last_daily_attempt_at=null,
    next_attempt_at=greatest(clock_timestamp(),last_attempt_at+interval '60 seconds'),updated_at=clock_timestamp()
  where query_kind='daily_history' and status in ('retry','needs_attention');
$$;
revoke all on function public.retry_historical_price_gaps() from public,anon,authenticated;
grant execute on function public.retry_historical_price_gaps() to service_role;

-- Newly stored dated inputs satisfy old gaps, including intervention/cooldown states.
-- Fence an in-flight older response before it can re-open satisfied work.
create function public.resolve_stored_price_gaps() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.price_acquisition_attempts a set outcome='data_arrived',finished_at=clock_timestamp()
  where a.lease_token in (select s.lease_token from public.price_acquisition_state s
    where s.instrument_id=new.instrument_id and s.query_kind='daily_history' and s.target_date=new.price_date)
    and a.finished_at is null;
  update public.price_acquisition_state s set status='resolved',last_outcome='success',reason=null,next_attempt_at=null,
    lease_token=null,lease_expires_at=null,transient_attempts=0,daily_attempts=0,updated_at=clock_timestamp()
    where s.instrument_id=new.instrument_id and s.query_kind='daily_history' and s.target_date=new.price_date;
  return null;
end;
$$;
revoke all on function public.resolve_stored_price_gaps() from public,anon,authenticated,service_role;
create trigger resolve_stored_price_gaps after insert or update on public.instrument_prices
for each row execute function public.resolve_stored_price_gaps();

create function public.price_gap_summary()
returns table(source text,pending bigint,needs_attention bigint,unsupported bigint,oldest_missing_date date,next_attempt_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.source,count(*) filter(where s.status in ('pending','retry')),count(*) filter(where s.status='needs_attention'),
    count(*) filter(where s.last_outcome='unsupported'),min(s.target_date),min(s.next_attempt_at)
  from public.price_acquisition_state s where s.query_kind='daily_history' and s.status<>'resolved' group by s.source;
$$;
revoke all on function public.price_gap_summary() from public,anon,authenticated;
grant execute on function public.price_gap_summary() to service_role;

-- An older HTTP completion must not replace a newer date or acquisition instant.
create function public.preserve_newer_dashboard_quote() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.fetched_at < old.fetched_at or new.quote_date < old.quote_date
    or (new.source_symbol is not distinct from old.source_symbol
      and (to_jsonb(new)->>'quote_at')::timestamptz < (to_jsonb(old)->>'quote_at')::timestamptz) then return old; end if;
  return new;
end;
$$;
create trigger preserve_newer_dashboard_quote before update on public.dashboard_instrument_quotes
for each row execute function public.preserve_newer_dashboard_quote();

revoke all on function public.ensure_price_acquisition(text,uuid,text,date),public.claim_price_acquisition(text,uuid,text,date,integer,boolean),public.complete_price_acquisition(uuid,text,text,integer,jsonb),public.preserve_newer_dashboard_quote() from public,anon,authenticated;
grant execute on function public.ensure_price_acquisition(text,uuid,text,date),public.claim_price_acquisition(text,uuid,text,date,integer,boolean),public.complete_price_acquisition(uuid,text,text,integer,jsonb) to service_role;

alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_acquisition;
revoke all on function public.export_ledger_backup_before_acquisition(uuid) from public,anon,authenticated,service_role;
create function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.export_ledger_backup_before_acquisition(excluded_job_run_id) || jsonb_build_object(
    '__price_acquisition_encoding','leases-reset-v1',
    'price_acquisition_state',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('lease_token',null,'lease_expires_at',null) order by t.source,t.instrument_id,t.query_kind,t.target_date) from public.price_acquisition_state t),'[]'::jsonb),
    'price_acquisition_attempts',coalesce((select jsonb_agg(to_jsonb(t) order by t.lease_token) from public.price_acquisition_attempts t),'[]'::jsonb),
    'instrument_price_revisions',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instrument_price_revisions t),'[]'::jsonb)
  );
$$;
revoke all on function public.export_ledger_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
notify pgrst,'reload schema';
