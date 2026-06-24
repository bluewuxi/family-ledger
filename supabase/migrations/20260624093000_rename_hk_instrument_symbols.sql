update public.instruments
set symbol = '01810.HK',
    updated_at = now()
where market_region = 'HK'
  and exchange = 'HKEX'
  and symbol = '01810'
  and price_source = 'yahoo_finance'
  and price_source_symbol = '1810.HK';

update public.instruments
set symbol = '00700.HK',
    updated_at = now()
where market_region = 'HK'
  and exchange = 'HKEX'
  and symbol = '00700'
  and price_source = 'yahoo_finance'
  and price_source_symbol = '0700.HK';
