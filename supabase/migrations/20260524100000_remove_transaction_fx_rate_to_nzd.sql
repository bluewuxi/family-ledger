alter table public.transactions
  drop constraint if exists transactions_fx_rate_positive_check;

alter table public.transactions
  drop column if exists fx_rate_to_nzd;
