begin;
alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_account_access;
create function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
select public.export_ledger_backup_before_account_access(excluded_job_run_id) || jsonb_build_object(
'__account_access_encoding','typed-grants-v1',
'account_access_policies',coalesce((select jsonb_agg(to_jsonb(t) order by t.user_id) from public.account_access_policies t),'[]'::jsonb),
'account_ledger_grants',coalesce((select jsonb_agg(to_jsonb(t) order by t.user_id,t.resource_id) from public.account_ledger_grants t),'[]'::jsonb),
'account_spending_grants',coalesce((select jsonb_agg(to_jsonb(t) order by t.user_id,t.resource_id) from public.account_spending_grants t),'[]'::jsonb),
'account_education_grants',coalesce((select jsonb_agg(to_jsonb(t) order by t.user_id,t.resource_id) from public.account_education_grants t),'[]'::jsonb),
'account_access_audit',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.account_access_audit t),'[]'::jsonb));
$$;
revoke all on function public.export_ledger_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
commit;
