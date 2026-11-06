begin;
create table public.resource_revisions (
  scope_key text primary key check (btrim(scope_key) <> ''),
  revision bigint not null default 0 check (revision >= 0)
);
insert into public.resource_revisions(scope_key) values ('investment_groups') on conflict do nothing;

-- The trim set matches ECMAScript String.trim, including Unicode boundary spaces.
create function public.trim_investment_group_name(value text) returns text
language sql immutable strict set search_path = '' as $$
  select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
create table public.investment_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = public.trim_investment_group_name(name) and char_length(name) between 1 and 32),
  name_key text not null unique check (name_key = lower(public.trim_investment_group_name(name))),
  created_by_user_id uuid references public.app_users(id),
  updated_by_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.investment_group_members (
  instrument_id uuid primary key references public.instruments(id) on delete cascade,
  group_id uuid not null references public.investment_groups(id) on delete cascade
);
create index investment_group_members_group_id on public.investment_group_members(group_id);

create function public.normalize_investment_group_name() returns trigger
language plpgsql set search_path = public as $$
begin
  new.name:=trim_investment_group_name(new.name);
  new.name_key:=lower(new.name);
  return new;
end $$;
create trigger investment_group_name before insert or update on public.investment_groups
for each row execute function public.normalize_investment_group_name();

create function public.lock_investment_groups_for_instruments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Existing advance_ledger_write_revision runs first: ledger -> purpose -> instrument.
  perform 1 from resource_revisions where scope_key='investment_groups' for update;
  if not found then raise exception 'Missing investment groups revision' using errcode='55000'; end if;
  return null;
end $$;
create trigger investment_groups_instrument_lock before update or delete on public.instruments
for each statement execute function public.lock_investment_groups_for_instruments();

create function public.guard_investment_group_instrument() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op='UPDATE' then
    if new.asset_type='cash' and exists(select 1 from investment_group_members where instrument_id=old.id) then
      raise exception 'Remove investment group membership before changing to cash' using errcode='23514';
    end if;
    return new;
  end if;
  if exists(select 1 from investment_group_members where instrument_id=old.id) then
    update resource_revisions set revision=revision+1 where scope_key='investment_groups';
    if not found then raise exception 'Missing investment groups revision' using errcode='55000'; end if;
  end if;
  return old;
end $$;
create trigger investment_groups_instrument_guard before update of asset_type or delete on public.instruments
for each row execute function public.guard_investment_group_instrument();

create function public.guard_investment_group_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from instruments where id=new.instrument_id and asset_type<>'cash' for share;
  if not found then raise exception 'Investment group member must be an existing non-cash instrument' using errcode='23514'; end if;
  return new;
end $$;
create trigger investment_group_member_guard before insert or update on public.investment_group_members
for each row execute function public.guard_investment_group_member();

create function public.read_investment_group_configuration() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  select jsonb_build_object('revision',r.revision::text,'groups',coalesce((
    select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'instrumentIds',coalesce((
      select jsonb_agg(m.instrument_id order by m.instrument_id) from investment_group_members m where m.group_id=g.id),'[]'::jsonb)) order by g.name_key,g.id)
    from investment_groups g),'[]'::jsonb)) into result from resource_revisions r where scope_key='investment_groups';
  if result is null then raise exception 'Missing investment groups revision' using errcode='55000'; end if;
  return result;
end $$;

create function public.write_investment_group(operation text, target_group_id uuid, group_name text, member_ids uuid[], expected_revision text, actor_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare current_revision bigint; saved_id uuid; saved_group jsonb;
begin
  if not exists(select 1 from user_roles where user_id=actor_id and role='admin' and is_active) then
    raise exception 'Active administrator required' using errcode='42501'; end if;
  if operation not in ('create','update','delete') or operation is null or expected_revision is null or expected_revision !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'Invalid group request' using errcode='23514'; end if;
  -- Lock only: classification writes never advance or mutate financial state.
  perform 1 from ledger_write_state where id for share;
  select revision into current_revision from resource_revisions where scope_key='investment_groups' for update;
  if not found then raise exception 'Missing investment groups revision' using errcode='55000'; end if;
  if current_revision::text<>expected_revision then raise exception 'Stale investment group revision' using errcode='40001'; end if;
  if operation<>'create' and not exists(select 1 from investment_groups where id=target_group_id) then
    raise exception 'Investment group not found' using errcode='P0002'; end if;
  if operation='delete' then
    delete from investment_groups where id=target_group_id;
  else
    if member_ids is null or cardinality(member_ids)<>(select count(distinct x) from unnest(member_ids) x) then
      raise exception 'Invalid group members' using errcode='23514'; end if;
    perform 1 from instruments where id=any(member_ids) order by id for share;
    if cardinality(member_ids)<>(select count(*) from instruments where id=any(member_ids) and asset_type<>'cash') then
      raise exception 'Investment group members must be existing non-cash instruments' using errcode='23514'; end if;
    if operation='create' then
      insert into investment_groups(name,created_by_user_id,updated_by_user_id)
        values(trim_investment_group_name(group_name),actor_id,actor_id) returning id into saved_id;
    else
      saved_id:=target_group_id;
      update investment_groups set name=trim_investment_group_name(group_name),updated_by_user_id=actor_id,updated_at=now() where id=saved_id;
    end if;
    delete from investment_group_members where group_id=saved_id and not(instrument_id=any(member_ids));
    insert into investment_group_members(instrument_id,group_id) select x,saved_id from unnest(member_ids) x
      on conflict(instrument_id) do update set group_id=excluded.group_id;
    saved_group:=jsonb_build_object('id',saved_id,'name',trim_investment_group_name(group_name),'instrumentIds',to_jsonb(member_ids));
  end if;
  update resource_revisions set revision=revision+1 where scope_key='investment_groups' returning revision into current_revision;
  return jsonb_build_object('revision',current_revision::text,'group',saved_group);
end $$;

alter table public.resource_revisions enable row level security;
alter table public.investment_groups enable row level security;
alter table public.investment_group_members enable row level security;
revoke all on public.resource_revisions,public.investment_groups,public.investment_group_members from public,anon,authenticated;
grant all on public.resource_revisions,public.investment_groups,public.investment_group_members to service_role;
revoke all on function public.normalize_investment_group_name(),public.trim_investment_group_name(text),public.lock_investment_groups_for_instruments(),public.guard_investment_group_instrument(),public.guard_investment_group_member(),public.read_investment_group_configuration(),public.write_investment_group(text,uuid,text,uuid[],text,uuid) from public,anon,authenticated;
grant execute on function public.trim_investment_group_name(text),public.read_investment_group_configuration(),public.write_investment_group(text,uuid,text,uuid[],text,uuid) to service_role;
alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_investment_groups;
revoke all on function public.export_ledger_backup_before_investment_groups(uuid) from public,anon,authenticated,service_role;
create function public.export_ledger_backup(excluded_job_run_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
  select public.export_ledger_backup_before_investment_groups(excluded_job_run_id) || jsonb_build_object(
    '__investment_groups_encoding','purpose-revisions-v1',
    'investment_groups',coalesce((select jsonb_agg(g order by g.id) from investment_groups g),'[]'::jsonb),
    'investment_group_members',coalesce((select jsonb_agg(m order by m.instrument_id) from investment_group_members m),'[]'::jsonb),
    'resource_revisions',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('revision',r.revision::text) order by r.scope_key) from resource_revisions r),'[]'::jsonb));
$$;
revoke all on function public.export_ledger_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
notify pgrst,'reload schema';
commit;
