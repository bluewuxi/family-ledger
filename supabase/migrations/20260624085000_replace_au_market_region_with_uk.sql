alter table public.investment_accounts
  drop constraint if exists investment_accounts_market_region_check;

alter table public.instruments
  drop constraint if exists instruments_market_region_check;

update public.investment_accounts
set market_region = 'UK',
    updated_at = now()
where market_region = 'AU';

update public.instruments
set market_region = 'UK',
    updated_at = now()
where market_region = 'AU';

alter table public.investment_accounts
  add constraint investment_accounts_market_region_check
  check (market_region in ('US', 'HK', 'CN', 'NZ', 'UK', 'MULTI', 'OTHER'));

alter table public.instruments
  add constraint instruments_market_region_check
  check (market_region in ('US', 'HK', 'CN', 'NZ', 'UK', 'MULTI', 'OTHER'));
