begin;
create function public.activate_first_app_admin(p_user_id uuid,p_expected_revision bigint)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Serialize bootstrap attempts; ordinary access changes still use row revisions.
 perform pg_advisory_xact_lock(762431091);
 perform 1 from public.user_roles where user_id=p_user_id for update;
 if exists(select 1 from public.user_roles where role='admin' and is_active and user_id<>p_user_id) then
  raise exception 'Another active administrator exists; use ordinary access management.' using errcode='23514';
 end if;
 update public.user_roles set is_active=true,access_revision=access_revision+1
 where user_id=p_user_id and role='admin' and access_revision=p_expected_revision
 and exists(select 1 from public.app_users where id=p_user_id);
 if not found then raise exception 'Administrator access revision changed or identity is not ready.' using errcode='40001'; end if;
end $$;
revoke all on function public.activate_first_app_admin(uuid,bigint) from public,anon,authenticated;
grant execute on function public.activate_first_app_admin(uuid,bigint) to service_role;
commit;
