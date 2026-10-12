-- Reject duplicate opening balances without deleting or rewriting existing financial records.
create unique index if not exists transactions_one_opening_balance_per_account
  on public.transactions (account_id)
  where transaction_type = 'opening_balance';
