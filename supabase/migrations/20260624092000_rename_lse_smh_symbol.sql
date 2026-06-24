update public.instruments
set symbol = 'SMH.L',
    short_name = 'SMH.L',
    updated_at = now()
where market_region = 'UK'
  and exchange = 'LSE'
  and symbol = 'SMH'
  and price_source = 'yahoo_finance'
  and price_source_symbol = 'SMH.L';
