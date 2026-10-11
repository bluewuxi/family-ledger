begin;

create table public.api_error_groups (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  summary text not null,
  method text not null,
  path text not null,
  operation text not null,
  error_code text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  observed_count integer not null default 0 check (observed_count >= 0),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  resolved_at timestamptz,
  recurring boolean not null default false,
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index api_error_groups_latest on public.api_error_groups(last_seen_at desc, id);
create table public.api_error_events (
  log_group text not null,
  log_stream text not null,
  event_id text not null,
  group_id uuid not null references public.api_error_groups(id) on delete cascade,
  occurred_at timestamptz not null,
  request_id text,
  legacy boolean not null default false,
  primary key (log_group, log_stream, event_id)
);
create index api_error_events_group on public.api_error_events(group_id, occurred_at desc, event_id);
alter table public.api_error_groups enable row level security;
alter table public.api_error_events enable row level security;
revoke all on public.api_error_groups, public.api_error_events from anon, authenticated;
grant all on public.api_error_groups, public.api_error_events to service_role;

-- Atomic observation and deduplication prevent overlapping queries from inflating counts.
create function public.observe_api_errors(events jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare item jsonb; target_id uuid; inserted integer; observed integer := 0; event_time timestamptz;
begin
  for item in select value from jsonb_array_elements(events) order by value->>'fingerprint', value->>'event_id' loop
    event_time := (item->>'occurred_at')::timestamptz;
    insert into api_error_groups (fingerprint, summary, method, path, operation, error_code, first_seen_at, last_seen_at)
    values (item->>'fingerprint', item->>'summary', item->>'method', item->>'path', item->>'operation', item->>'error_code', event_time, event_time)
    on conflict (fingerprint) do nothing;
    select id into target_id from api_error_groups where fingerprint = item->>'fingerprint' for update;
    insert into api_error_events(log_group, log_stream, event_id, group_id, occurred_at, request_id, legacy)
    values(item->>'log_group', item->>'log_stream', item->>'event_id', target_id, event_time, item->>'request_id', (item->>'legacy')::boolean)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted > 0 then
      update api_error_groups set
        first_seen_at = least(first_seen_at, event_time), last_seen_at = greatest(last_seen_at, event_time),
        observed_count = observed_count + 1,
        recurring = recurring or (resolved_at is not null and event_time > resolved_at),
        status = case when resolved_at is not null and event_time > resolved_at then 'open' else status end
      where id = target_id;
      observed := observed + 1;
    end if;
  end loop;
  return observed;
end $$;
revoke all on function public.observe_api_errors(jsonb) from public, anon, authenticated;
grant execute on function public.observe_api_errors(jsonb) to service_role;

create function public.update_api_error_status(target_id uuid, new_status text, new_notes text, actor_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update api_error_groups set status = new_status, notes = new_notes,
    resolved_at = case when new_status = 'resolved' then clock_timestamp() else resolved_at end,
    recurring = case when new_status = 'resolved' then false else recurring end,
    updated_at = clock_timestamp(), updated_by = actor_id where id = target_id;
  if not found then raise exception using errcode = 'P0002', message = 'Error group not found'; end if;
end $$;
revoke all on function public.update_api_error_status(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.update_api_error_status(uuid,text,text,uuid) to service_role;
commit;
