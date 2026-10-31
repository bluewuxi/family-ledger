begin;

-- Add stable identities to the same statement snapshot as the existing exporter.
alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_app_users;
create function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select public.export_ledger_backup_before_app_users(excluded_job_run_id)
   || jsonb_build_object('app_users',coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from public.app_users u),'[]'::jsonb));
$$;

-- Redirect retained legacy SQL creator validation without changing its financial logic.
do $$
declare f record;
begin
 for f in select p.oid,pg_get_functiondef(p.oid) as definition from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.prosrc like '%auth.users%'
 loop
  execute replace(replace(f.definition,'auth.users','public.app_users'),'Supabase Auth user','application user');
 end loop;
end $$;

-- Authentication is now API-only. No current public reference-data grant exists.
do $$
declare p record;
begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public'
 loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;
drop function if exists public.has_active_role(text);
revoke all on all tables in schema public from public,anon,authenticated;
revoke all on all sequences in schema public from public,anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
notify pgrst,'reload schema';
commit;
