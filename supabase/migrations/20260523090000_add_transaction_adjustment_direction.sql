alter table public.transactions
  add column if not exists adjustment_direction text;

alter table public.transactions
  drop constraint if exists transactions_adjustment_direction_check;

alter table public.transactions
  add constraint transactions_adjustment_direction_check check (
    (
      transaction_type = 'adjustment'
      and adjustment_direction in ('increase', 'decrease')
    )
    or (
      transaction_type <> 'adjustment'
      and adjustment_direction is null
    )
  ) not valid;
