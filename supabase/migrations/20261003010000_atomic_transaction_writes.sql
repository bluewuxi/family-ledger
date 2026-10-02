-- Preparation happens in the API without writes. A revision guard rejects stale
-- plans, and this RPC commits the complete ledger mutation in one transaction.
create table if not exists public.ledger_write_state (
  id boolean primary key default true check (id),
  revision bigint not null default 0
);
insert into public.ledger_write_state (id) values (true) on conflict do nothing;
alter table public.ledger_write_state enable row level security;
revoke all on public.ledger_write_state from public, anon, authenticated;
grant select, update on public.ledger_write_state to service_role;

create or replace function public.advance_ledger_write_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.ledger_write_state set revision = revision + 1 where id;
  return null;
end;
$$;
revoke all on function public.advance_ledger_write_revision() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['transactions', 'investment_accounts', 'instruments',
    'instrument_prices', 'exchange_rates', 'portfolio_snapshot_headers', 'portfolio_account_snapshots'] loop
    execute format('drop trigger if exists advance_ledger_write_revision on public.%I', table_name);
    execute format('create trigger advance_ledger_write_revision before insert or update or delete or truncate on public.%I
      for each statement execute function public.advance_ledger_write_revision()', table_name);
  end loop;
end;
$$;

create or replace function public.get_ledger_write_revision()
returns text language sql stable security invoker set search_path = '' as $$
  select revision::text from public.ledger_write_state where id;
$$;
revoke all on function public.get_ledger_write_revision() from public, anon, authenticated;
grant execute on function public.get_ledger_write_revision() to service_role;

create or replace function public.commit_transaction_write(
  operation text, transaction_id uuid, expected_revision text, actor_id uuid,
  parent_row jsonb, cash_row jsonb, price_row jsonb, snapshot_values jsonb,
  update_derived_data boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_revision bigint;
  existing public.transactions;
  parent public.transactions;
  cash public.transactions;
  snapshot jsonb;
  result jsonb;
  stage text := 'transaction';
begin
  select revision into current_revision from public.ledger_write_state where id for update;
  if current_revision::text is distinct from expected_revision then
    raise exception using errcode = '40001', message = 'Ledger changed during preparation';
  end if;
  if operation not in ('create', 'update', 'delete') or operation is null
    or update_derived_data is null or jsonb_typeof(snapshot_values) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid transaction write plan';
  end if;
  if operation in ('create', 'delete') and not update_derived_data then
    raise exception using errcode = '22023', message = 'Create and delete require derived data';
  end if;
  if not exists (select 1 from public.user_roles where user_id = actor_id and role = 'admin' and is_active) then
    raise exception using errcode = '42501', message = 'An active administrator is required';
  end if;
  if operation <> 'create' then
    select * into existing from public.transactions where id = transaction_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Transaction not found'; end if;
    if existing.transaction_source <> 'manual' then
      raise exception using errcode = '22023', message = 'Generated cash legs cannot be changed directly';
    end if;
  end if;
  if operation = 'delete' then
    delete from public.transactions where id = transaction_id;
  else
    parent := jsonb_populate_record(null::public.transactions, parent_row);
    if parent.transaction_source is distinct from 'manual' or parent.linked_transaction_id is not null then
      raise exception using errcode = '22023', message = 'A manual transaction is required';
    end if;
    if operation = 'update' and parent.transaction_type is distinct from existing.transaction_type then
      raise exception using errcode = '22023', message = 'Transaction type cannot change';
    end if;
    if operation = 'create' then
      insert into public.transactions (id, account_id, instrument_id, transaction_type, trade_date, settlement_date,
        quantity, price, gross_amount, fee, tax, currency, adjustment_direction, transaction_source,
        linked_transaction_id, settlement_currency, settlement_amount, notes, created_by_user_id, updated_by_user_id)
      values (transaction_id, parent.account_id, parent.instrument_id, parent.transaction_type, parent.trade_date,
        parent.settlement_date, parent.quantity, parent.price, parent.gross_amount, parent.fee, parent.tax,
        parent.currency, parent.adjustment_direction, 'manual', null, parent.settlement_currency,
        parent.settlement_amount, parent.notes, actor_id, actor_id);
    else
      if not update_derived_data then
        -- A note-only edit preserves every financial field and derived row.
        update public.transactions set notes = parent.notes, updated_by_user_id = actor_id where id = transaction_id;
      else
        update public.transactions set account_id = parent.account_id, instrument_id = parent.instrument_id,
        trade_date = parent.trade_date, settlement_date = parent.settlement_date, quantity = parent.quantity,
        price = parent.price, gross_amount = parent.gross_amount, fee = parent.fee, tax = parent.tax,
        currency = parent.currency, adjustment_direction = parent.adjustment_direction,
        settlement_currency = parent.settlement_currency, settlement_amount = parent.settlement_amount,
          notes = parent.notes, updated_by_user_id = actor_id where id = transaction_id;
      end if;
    end if;
  end if;
  if update_derived_data then
    stage := 'cash';
    if operation <> 'delete' then
      if cash_row is null or cash_row = 'null'::jsonb then
        delete from public.transactions where linked_transaction_id = transaction_id and transaction_source = 'generated_cash_leg';
      else
        cash := jsonb_populate_record(null::public.transactions, cash_row);
        if cash.transaction_source is distinct from 'generated_cash_leg'
          or cash.linked_transaction_id is distinct from transaction_id or cash.account_id is distinct from parent.account_id then
          raise exception using errcode = '22023', message = 'Invalid linked cash leg';
        end if;
        insert into public.transactions (account_id, instrument_id, transaction_type, trade_date, settlement_date,
          quantity, price, gross_amount, fee, tax, currency, adjustment_direction, transaction_source,
          linked_transaction_id, settlement_currency, settlement_amount, notes, created_by_user_id, updated_by_user_id)
        values (cash.account_id, cash.instrument_id, cash.transaction_type, cash.trade_date, cash.settlement_date,
          cash.quantity, cash.price, cash.gross_amount, cash.fee, cash.tax, cash.currency, cash.adjustment_direction,
          cash.transaction_source, transaction_id, cash.settlement_currency, cash.settlement_amount, cash.notes, actor_id, actor_id)
        on conflict (linked_transaction_id) where transaction_source = 'generated_cash_leg' do update set
          account_id = excluded.account_id, instrument_id = excluded.instrument_id,
          transaction_type = excluded.transaction_type, trade_date = excluded.trade_date, settlement_date = excluded.settlement_date,
          gross_amount = excluded.gross_amount, currency = excluded.currency, notes = excluded.notes, updated_by_user_id = actor_id;
      end if;
    end if;
    stage := 'price';
    delete from public.instrument_prices where source_transaction_id = transaction_id;
    if price_row is not null and price_row <> 'null'::jsonb then
      if operation = 'delete' or (price_row->>'sourceTransactionId')::uuid is distinct from transaction_id then
        raise exception using errcode = '22023', message = 'Invalid generated price';
      end if;
      insert into public.instrument_prices (instrument_id, price_date, close_price, currency, provider,
        source_symbol, is_adjusted, fetched_at, source_transaction_id)
      values ((price_row->>'instrumentId')::uuid, (price_row->>'priceDate')::date,
        (price_row->>'closePrice')::numeric, price_row->>'currency', 'manual', price_row->>'sourceSymbol',
        false, (price_row->>'fetchedAt')::timestamptz, transaction_id);
    end if;
    stage := 'snapshot';
    for snapshot in select value from jsonb_array_elements(snapshot_values) loop
      perform public.upsert_portfolio_snapshot(snapshot);
    end loop;
  end if;
  if operation <> 'delete' then
    select to_jsonb(t) || jsonb_build_object('instruments', jsonb_build_object(
      'symbol', i.symbol, 'name', i.name, 'short_name', i.short_name, 'asset_type', i.asset_type))
      into result from public.transactions t join public.instruments i on i.id = t.instrument_id where t.id = transaction_id;
  end if;
  return result;
exception when others then
  -- Preserve stable SQLSTATEs but keep database internals out of API responses.
  raise exception using errcode = sqlstate, message = 'Atomic transaction write failed', detail = stage;
end;
$$;
revoke all on function public.commit_transaction_write(text, uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.commit_transaction_write(text, uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean) to service_role;
