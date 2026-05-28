alter table public.investment_accounts
  add column if not exists trading_info text;
