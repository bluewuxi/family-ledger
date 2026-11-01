begin;

create table public.account_access_policies (
 user_id uuid primary key references public.app_users(id) on delete cascade,
 mode text not null default 'selected' check(mode in ('all','selected')),
 revision integer not null default 0 check(revision >= 0)
);
create table public.account_ledger_grants (
 user_id uuid references public.account_access_policies(user_id) on delete cascade,
 resource_id uuid references public.investment_accounts(id) on delete cascade,
 primary key(user_id,resource_id)
);
create table public.account_spending_grants (
 user_id uuid references public.account_access_policies(user_id) on delete cascade,
 resource_id uuid references public.spending_accounts(id) on delete cascade,
 primary key(user_id,resource_id)
);
create table public.account_education_grants (
 user_id uuid references public.account_access_policies(user_id) on delete cascade,
 resource_id uuid references public.education_reserve_funds(id) on delete cascade,
 primary key(user_id,resource_id)
);
create table public.account_access_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references public.app_users(id),
 target_id uuid not null references public.app_users(id),
 changed_at timestamptz not null default now(),
 previous_scope jsonb not null, next_scope jsonb not null
);

-- Existing viewers receive no implicit grants. Initial access is reviewed separately.
insert into public.account_access_policies(user_id,mode)
 select id,case when exists(select 1 from public.user_roles r where r.user_id=u.id and r.role='admin') then 'all' else 'selected' end from public.app_users u;

create function public.read_account_scope(target uuid) returns jsonb
 language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('userId',p.user_id,'revision',p.revision,'scope',
  case when p.mode='all' then jsonb_build_object('mode','all') else
  jsonb_build_object('mode','selected','resources',coalesce((select jsonb_agg(x.ref order by x.ref->>'kind',x.ref->>'id') from (
   select jsonb_build_object('kind','ledger','id',resource_id) ref from account_ledger_grants where user_id=target
   union all select jsonb_build_object('kind','spending','id',resource_id) from account_spending_grants where user_id=target
   union all select jsonb_build_object('kind','education','id',resource_id) from account_education_grants where user_id=target
  ) x),'[]'::jsonb)) end)
 from account_access_policies p where user_id=target;
$$;

create function public.replace_account_scope(actor uuid,target uuid,expected_revision integer,new_scope jsonb) returns jsonb
 language plpgsql security invoker set search_path=public as $$
declare previous jsonb; ref jsonb; policy account_access_policies;
begin
 if actor=target or not exists(select 1 from user_roles where user_id=actor and role='admin' and is_active) then
  raise exception 'Access denied' using errcode='42501';
 end if;
 -- Serialize role/scope changes on the same user-role row.
 perform 1 from user_roles where user_id=target for update;
 select * into policy from account_access_policies where user_id=target for update;
 if not found or expected_revision is null or policy.revision<>expected_revision then raise exception 'Stale scope' using errcode='40001'; end if;
 if jsonb_typeof(new_scope)<>'object' or new_scope->>'mode' not in ('all','selected') or new_scope->>'mode' is null then
  raise exception 'Invalid scope' using errcode='23514';
 end if;
 if (new_scope->>'mode'='selected' and jsonb_typeof(new_scope->'resources') is distinct from 'array')
  or (new_scope->>'mode'='all' and new_scope ? 'resources')
  or exists(select 1 from jsonb_object_keys(new_scope) k where k not in ('mode','resources')) then
  raise exception 'Invalid resources' using errcode='23514';
 end if;
 if exists(select 1 from user_roles where user_id=target and role='admin') and new_scope->>'mode'<>'all' then
  raise exception 'Administrators require all scope' using errcode='23514';
 end if;
 previous:=read_account_scope(target);
 delete from account_ledger_grants where user_id=target;
 delete from account_spending_grants where user_id=target;
 delete from account_education_grants where user_id=target;
 for ref in select value from jsonb_array_elements(coalesce(new_scope->'resources','[]'::jsonb)) loop
  if jsonb_typeof(ref)<>'object' or ref->>'id' is null or ref->>'kind' is null
   or exists(select 1 from jsonb_object_keys(ref) k where k not in ('id','kind')) then
   raise exception 'Invalid resource' using errcode='23514';
  end if;
  case ref->>'kind'
   when 'ledger' then insert into account_ledger_grants values(target,(ref->>'id')::uuid) on conflict do nothing;
   when 'spending' then insert into account_spending_grants values(target,(ref->>'id')::uuid) on conflict do nothing;
   when 'education' then insert into account_education_grants values(target,(ref->>'id')::uuid) on conflict do nothing;
   else raise exception 'Invalid resource kind' using errcode='23514';
  end case;
 end loop;
 update account_access_policies set mode=new_scope->>'mode',revision=revision+1 where user_id=target;
 if coalesce(current_setting('app.combined_access_change',true),'')<>'true' then
  insert into account_access_audit(actor_id,target_id,previous_scope,next_scope) values(actor,target,previous,read_account_scope(target));
 end if;
 return read_account_scope(target);
end;
$$;

create function public.initialize_account_scope() returns trigger
 language plpgsql security invoker set search_path=public as $$
begin
 insert into account_access_policies(user_id) values(new.id) on conflict do nothing;
 return new;
end;
$$;
create trigger initialize_account_scope after insert on public.app_users for each row execute function public.initialize_account_scope();

-- A role change persists the demotion default atomically with the role itself.
create function public.account_scope_role_transition() returns trigger
 language plpgsql security invoker set search_path=public as $$
begin
 if new.role='admin' or (old.role='admin' and new.role='viewer') then
  update account_access_policies set mode='all',revision=revision+1 where user_id=new.user_id;
  delete from account_ledger_grants where user_id=new.user_id;
  delete from account_spending_grants where user_id=new.user_id;
  delete from account_education_grants where user_id=new.user_id;
 end if;
 return new;
end;
$$;
create trigger account_scope_role_transition after update of role on public.user_roles for each row
 when (old.role is distinct from new.role) execute function public.account_scope_role_transition();

do $$ declare t text; begin
 foreach t in array array['account_access_policies','account_ledger_grants','account_spending_grants','account_education_grants','account_access_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.update_managed_access(actor uuid,target uuid,expected_access_revision integer,new_role text,new_active boolean,expected_scope_revision integer,new_scope jsonb)
 returns void language plpgsql security invoker set search_path=public as $$
declare old_access user_roles; old_scope_revision integer; original_scope jsonb;
begin
 if actor=target or not exists(select 1 from user_roles where user_id=actor and role='admin' and is_active) then
  raise exception 'Access denied' using errcode='42501';
 end if;
 select * into old_access from user_roles where user_id=target for update;
 if not found or expected_access_revision is null or old_access.access_revision<>expected_access_revision then raise exception 'Stale access' using errcode='40001'; end if;
 select revision into old_scope_revision from account_access_policies where user_id=target for update;
 if new_scope is not null and (expected_scope_revision is null or old_scope_revision<>expected_scope_revision) then raise exception 'Stale scope' using errcode='40001'; end if;
 if new_role is not null and new_role not in ('admin','viewer') then raise exception 'Invalid role' using errcode='23514'; end if;
 original_scope:=read_account_scope(target);
 perform set_config('app.combined_access_change','true',true);
 update user_roles set role=coalesce(new_role,role),is_active=coalesce(new_active,is_active),access_revision=access_revision+1 where user_id=target;
 if new_scope is not null then
  perform replace_account_scope(actor,target,(select revision from account_access_policies where user_id=target),new_scope);
 end if;
 if new_scope is not null or old_access.role is distinct from coalesce(new_role,old_access.role) then
  insert into account_access_audit(actor_id,target_id,previous_scope,next_scope) values(actor,target,original_scope,read_account_scope(target));
 end if;
 perform set_config('app.combined_access_change','false',true);
end;
$$;
revoke all on function public.update_managed_access(uuid,uuid,integer,text,boolean,integer,jsonb) from public,anon,authenticated;
grant execute on function public.update_managed_access(uuid,uuid,integer,text,boolean,integer,jsonb) to service_role;
revoke all on function public.read_account_scope(uuid),public.replace_account_scope(uuid,uuid,integer,jsonb),public.initialize_account_scope(),public.account_scope_role_transition() from public,anon,authenticated;
grant execute on function public.read_account_scope(uuid),public.replace_account_scope(uuid,uuid,integer,jsonb) to service_role;
commit;
