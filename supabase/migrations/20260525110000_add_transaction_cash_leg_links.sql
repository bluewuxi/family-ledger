alter table public.transactions
  add column if not exists transaction_source text not null default 'manual',
  add column if not exists linked_transaction_id uuid references public.transactions(id) on delete cascade,
  add column if not exists settlement_currency text,
  add column if not exists settlement_amount numeric(28, 6);

alter table public.transactions
  drop constraint if exists transactions_transaction_source_check;

alter table public.transactions
  add constraint transactions_transaction_source_check check (
    transaction_source in ('manual', 'generated_cash_leg')
  );

alter table public.transactions
  drop constraint if exists transactions_settlement_currency_check;

alter table public.transactions
  add constraint transactions_settlement_currency_check check (
    settlement_currency is null
    or settlement_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')
  );

alter table public.transactions
  drop constraint if exists transactions_settlement_amount_non_negative_check;

alter table public.transactions
  add constraint transactions_settlement_amount_non_negative_check check (
    settlement_amount is null or settlement_amount >= 0
  );

alter table public.transactions
  drop constraint if exists transactions_generated_cash_leg_shape_check;

alter table public.transactions
  add constraint transactions_generated_cash_leg_shape_check check (
    (
      transaction_source = 'generated_cash_leg'
      and linked_transaction_id is not null
      and transaction_type in ('deposit', 'withdrawal')
      and quantity is null
      and price is null
      and fee = 0
      and tax = 0
      and adjustment_direction is null
    )
    or transaction_source = 'manual'
  );

create index if not exists transactions_linked_transaction_id_idx
  on public.transactions(linked_transaction_id);

create unique index if not exists transactions_generated_cash_leg_parent_key
  on public.transactions(linked_transaction_id)
  where transaction_source = 'generated_cash_leg';
