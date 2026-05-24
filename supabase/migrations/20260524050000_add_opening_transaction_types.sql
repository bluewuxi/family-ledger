alter table public.transactions
  drop constraint if exists transactions_transaction_type_check;

alter table public.transactions
  add constraint transactions_transaction_type_check check (
    transaction_type in (
      'opening_position',
      'opening_balance',
      'buy',
      'sell',
      'dividend',
      'fee',
      'tax',
      'deposit',
      'withdrawal',
      'interest',
      'adjustment'
    )
  );
