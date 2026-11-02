-- Durable create intents survive transaction deletion and have no automatic expiry.
create table public.transaction_create_requests (
  actor_id uuid not null references public.app_users(id),
  request_key uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  transaction_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_key)
);
alter table public.transaction_create_requests enable row level security;
revoke all on public.transaction_create_requests from public, anon, authenticated;
grant select, insert on public.transaction_create_requests to service_role;

create or replace function public.find_transaction_create_replay(actor_id uuid, request_key uuid, request_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored public.transaction_create_requests;
begin
  if not exists(select 1 from public.user_roles r where r.user_id=actor_id and r.role='admin' and r.is_active) then
    raise exception using errcode='42501', message='Active administrator required';
  end if;
  select * into stored from public.transaction_create_requests r where r.actor_id=find_transaction_create_replay.actor_id and r.request_key=find_transaction_create_replay.request_key;
  if not found then return null; end if;
  if stored.fingerprint is distinct from request_fingerprint then
    raise exception using errcode='P0001', message='Idempotency key content conflict';
  end if;
  return stored.response;
end;
$$;

create or replace function public.commit_transaction_create_idempotent(
  operation text, transaction_id uuid, expected_revision text, actor_id uuid,
  parent_row jsonb, cash_row jsonb, price_row jsonb, snapshot_values jsonb,
  update_derived_data boolean, request_key uuid, request_fingerprint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if operation is distinct from 'create' then raise exception using errcode='22023', message='Create operation required'; end if;
  -- Same lock ordering as every ledger writer. Replay precedes revision checking.
  perform 1 from public.ledger_write_state where id for update;
  result := public.find_transaction_create_replay(actor_id, request_key, request_fingerprint);
  if result is not null then return result; end if;
  result := public.commit_transaction_write(operation, transaction_id, expected_revision, actor_id,
    parent_row, cash_row, price_row, snapshot_values, update_derived_data);
  insert into public.transaction_create_requests(actor_id, request_key, fingerprint, transaction_id, response)
    values(actor_id, request_key, request_fingerprint, transaction_id, result);
  return result;
end;
$$;
revoke all on function public.find_transaction_create_replay(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.commit_transaction_create_idempotent(text,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.find_transaction_create_replay(uuid,uuid,text) to service_role;
grant execute on function public.commit_transaction_create_idempotent(text,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,boolean,uuid,text) to service_role;

-- Keep the existing exact-numeric exporter and append the new durable state.
alter function public.export_ledger_backup(uuid) rename to export_ledger_backup_before_reliability;
revoke all on function public.export_ledger_backup_before_reliability(uuid) from public,anon,authenticated,service_role;
create function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.export_ledger_backup_before_reliability(excluded_job_run_id) || jsonb_build_object(
    'snapshot_repair_state', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.snapshot_repair_state t), '[]'::jsonb),
    'transaction_create_requests', coalesce((select jsonb_agg(to_jsonb(t) order by t.actor_id,t.request_key) from public.transaction_create_requests t), '[]'::jsonb)
  );
$$;
revoke all on function public.export_ledger_backup(uuid) from public,anon,authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;
