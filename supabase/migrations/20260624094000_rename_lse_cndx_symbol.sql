update public.instruments
set symbol = 'CNDX.L',
    short_name = 'CNDX.L',
    updated_at = now()
where market_region = 'UK'
  and exchange = 'LSE'
  and symbol = 'CNDX'
  and price_source = 'yahoo_finance'
  and price_source_symbol = 'CNDX.L';
