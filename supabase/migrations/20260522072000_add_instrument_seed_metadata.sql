alter table public.instruments
  add column if not exists description text,
  add column if not exists source_url text,
  add column if not exists source_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'instruments_market_exchange_symbol_key'
  ) then
    alter table public.instruments
      add constraint instruments_market_exchange_symbol_key unique (market_region, exchange, symbol);
  end if;
end;
$$;
