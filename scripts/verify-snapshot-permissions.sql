-- Isolated local restore only; auth.users/uid are fixture dependencies there.
\set ON_ERROR_STOP on
begin;
do $$ begin
  assert inet_server_addr() = '127.0.0.1'::inet, 'Run only on the isolated local restore';
end $$;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into public.user_roles(user_id, role) values
  ('10000000-0000-4000-8000-000000000001', 'viewer'), ('10000000-0000-4000-8000-000000000002', 'admin');
-- pg_restore --no-privileges omits Supabase default table grants; restore those here.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$ begin
  assert (select count(*) > 0 from public.portfolio_snapshots), 'Viewer can read derived history';
  begin
    insert into public.portfolio_snapshot_headers(snapshot_date) values('2099-08-01');
    raise exception 'Viewer unexpectedly wrote header';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.investment_accounts(name, account_type, purpose) values('Forbidden', 'bank', 'education');
    raise exception 'Viewer unexpectedly wrote account';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
insert into public.portfolio_snapshot_headers(snapshot_date) values('2099-08-01');
insert into public.investment_accounts(name, account_type, purpose) values('Allowed fixture', 'bank', 'education');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$ begin
  assert (select count(*) = 0 from public.portfolio_snapshots), 'Nonmember cannot read invoker view';
end $$;
rollback;
