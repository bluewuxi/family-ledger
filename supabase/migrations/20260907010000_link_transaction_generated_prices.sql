alter table public.instrument_prices
  add column if not exists source_transaction_id uuid;

alter table public.instrument_prices
  drop constraint if exists instrument_prices_source_transaction_id_fkey;

alter table public.instrument_prices
  add constraint instrument_prices_source_transaction_id_fkey
  foreign key (source_transaction_id)
  references public.transactions(id)
  on delete cascade;

create unique index if not exists instrument_prices_source_transaction_id_key
  on public.instrument_prices(source_transaction_id)
  where source_transaction_id is not null;

drop index if exists public.instrument_prices_source_transaction_id_idx;
