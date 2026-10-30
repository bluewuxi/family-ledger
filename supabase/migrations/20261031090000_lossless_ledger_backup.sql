begin;

alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_decimal_strings;

-- Convert PostgreSQL numeric JSON values before any client decoder sees them.
-- STABLE preserves the calling statement snapshot, including the legacy exporter.
create function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  bundle jsonb := public.export_ledger_backup_before_decimal_strings(excluded_job_run_id);
  item record;
  fields text[];
begin
  for item in select key, value from jsonb_each(bundle) loop
    select array_agg(a.attname::text) into fields
    from pg_attribute a
    where a.attrelid = to_regclass(format('public.%I', item.key))
      and a.attnum > 0 and not a.attisdropped and a.atttypid = 'numeric'::regtype;
    if fields is not null then
      bundle := jsonb_set(bundle, array[item.key], coalesce((
        select jsonb_agg(r.value || coalesce((
          select jsonb_object_agg(f.key, case when f.value = 'null'::jsonb then 'null'::jsonb
            else to_jsonb(f.value #>> '{}') end)
          from jsonb_each(r.value) f where f.key = any(fields)
        ), '{}'::jsonb) order by r.ordinality)
        from jsonb_array_elements(item.value) with ordinality r(value, ordinality)
      ), '[]'::jsonb));
    end if;
  end loop;
  return bundle || jsonb_build_object('__financial_numeric_encoding', 'decimal-strings-v1');
end;
$$;
revoke all on function public.export_ledger_backup(uuid) from public, anon, authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
