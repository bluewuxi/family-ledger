begin;

create table if not exists public.app_users (
  id uuid primary key,
  email text not null unique check (email = lower(btrim(email)) and email <> ''),
  created_at timestamptz not null default now()
);

-- Refuse ambiguous identities instead of inventing login addresses.
do $$
begin
  if exists (select 1 from auth.users where email is null or btrim(email) = '') then
    raise exception 'Application identity migration requires reviewed email mappings for every historical user.';
  end if;
  if exists (select lower(btrim(email)) from auth.users group by lower(btrim(email)) having count(*) > 1) then
    raise exception 'Application identity migration found normalized email collisions.';
  end if;
end $$;

insert into public.app_users (id, email, created_at)
select id, lower(btrim(email)), created_at from auth.users
on conflict (id) do nothing;

alter table public.app_users enable row level security;
revoke all on public.app_users from public, anon, authenticated;
grant select, insert, update, delete on public.app_users to service_role;

alter table public.user_roles add column if not exists access_revision bigint not null default 0;

-- Preserve each existing constraint's delete action and deferrability.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as relation, conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where contype = 'f' and confrelid = 'auth.users'::regclass
      and connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', c.relation, c.conname);
    execute format('alter table %s add constraint %I %s', c.relation, c.conname,
      replace(c.definition, 'REFERENCES auth.users', 'REFERENCES public.app_users'));
  end loop;
end $$;

comment on table public.app_users is 'Stable application identities independent of the authentication provider.';
commit;
