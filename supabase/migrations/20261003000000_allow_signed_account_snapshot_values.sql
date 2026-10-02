-- Net account value includes cash liabilities and may be negative on historical
-- dates. Preserve the calculated amount rather than rejecting snapshot rebuilds.
alter table public.portfolio_account_snapshots
  drop constraint if exists portfolio_account_snapshots_market_value_usd_non_negative_check;
