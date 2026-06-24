do $$
declare
  blocking_count integer;
begin
  select count(*) into blocking_count
  from public.profiles
  where preferred_currency = 'AUD';

  if blocking_count > 0 then
    raise exception 'Cannot remove AUD because % profile rows still use it.', blocking_count;
  end if;

  select count(*) into blocking_count
  from public.investment_accounts
  where base_currency = 'AUD';

  if blocking_count > 0 then
    raise exception 'Cannot remove AUD because % account rows still use it.', blocking_count;
  end if;

  select count(*) into blocking_count
  from public.instruments
  where currency = 'AUD'
    and not (
      symbol = 'CASH_AUD'
      and exchange = 'CASH'
      and asset_type = 'cash'
    );

  if blocking_count > 0 then
    raise exception 'Cannot remove AUD because % non-cash-AUD instrument rows still use it.', blocking_count;
  end if;

  select count(*) into blocking_count
  from public.transactions
  where currency = 'AUD'
    or settlement_currency = 'AUD'
    or instrument_id in (
      select id
      from public.instruments
      where symbol = 'CASH_AUD'
        and exchange = 'CASH'
        and currency = 'AUD'
        and asset_type = 'cash'
    );

  if blocking_count > 0 then
    raise exception 'Cannot remove AUD because % transaction rows still use it.', blocking_count;
  end if;

  select count(*) into blocking_count
  from public.instrument_prices
  where currency = 'AUD'
    or instrument_id in (
      select id
      from public.instruments
      where symbol = 'CASH_AUD'
        and exchange = 'CASH'
        and currency = 'AUD'
        and asset_type = 'cash'
    );

  if blocking_count > 0 then
    raise exception 'Cannot remove AUD because % instrument price rows still use it.', blocking_count;
  end if;

  if to_regclass('public.prices') is not null then
    execute $legacy_prices$
      select count(*)
      from public.prices
      where currency = 'AUD'
        or instrument_id in (
          select id
          from public.instruments
          where symbol = 'CASH_AUD'
            and exchange = 'CASH'
            and currency = 'AUD'
            and asset_type = 'cash'
        )
    $legacy_prices$
    into blocking_count;

    if blocking_count > 0 then
      raise exception 'Cannot remove AUD because % legacy price rows still use it.', blocking_count;
    end if;
  end if;
end $$;

delete from public.exchange_rates
where from_currency = 'AUD'
   or to_currency = 'AUD';

do $$
begin
  if to_regclass('public.fx_rates') is not null then
    delete from public.fx_rates
    where from_currency = 'AUD'
       or to_currency = 'AUD';
  end if;
end $$;

delete from public.instruments
where symbol = 'CASH_AUD'
  and exchange = 'CASH'
  and currency = 'AUD'
  and asset_type = 'cash';

delete from public.currencies
where code = 'AUD';

alter table public.currencies
  drop constraint if exists currencies_code_check,
  add constraint currencies_code_check check (code in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR'));

alter table public.profiles
  drop constraint if exists profiles_preferred_currency_check,
  add constraint profiles_preferred_currency_check check (preferred_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR'));

alter table public.investment_accounts
  drop constraint if exists investment_accounts_base_currency_check,
  add constraint investment_accounts_base_currency_check check (base_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR'));

alter table public.instruments
  drop constraint if exists instruments_currency_check,
  add constraint instruments_currency_check check (currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR'));

alter table public.transactions
  drop constraint if exists transactions_currency_check,
  add constraint transactions_currency_check check (currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
  drop constraint if exists transactions_settlement_currency_check,
  add constraint transactions_settlement_currency_check check (
    settlement_currency is null
    or settlement_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')
  );

do $$
begin
  if to_regclass('public.prices') is not null then
    alter table public.prices
      drop constraint if exists prices_currency_check,
      add constraint prices_currency_check check (currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR'));
  end if;

  if to_regclass('public.fx_rates') is not null then
    alter table public.fx_rates
      drop constraint if exists fx_rates_from_currency_check,
      add constraint fx_rates_from_currency_check check (from_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
      drop constraint if exists fx_rates_to_currency_check,
      add constraint fx_rates_to_currency_check check (to_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR'));
  end if;
end $$;
