create or replace function public.latest_valuation_rates_to_usd_for_dates(
  as_of_dates date[],
  from_currencies text[] default null
)
returns table (
  as_of_date date,
  id uuid,
  rate_date date,
  from_currency text,
  to_currency text,
  rate numeric,
  rate_type text,
  provider text,
  provider_rate_date date,
  fetched_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_dates as (
    select distinct unnest(as_of_dates) as as_of_date
  )
  select distinct on (requested_dates.as_of_date, exchange_rates.from_currency)
    requested_dates.as_of_date,
    exchange_rates.id,
    exchange_rates.rate_date,
    exchange_rates.from_currency,
    exchange_rates.to_currency,
    exchange_rates.rate,
    exchange_rates.rate_type,
    exchange_rates.provider,
    exchange_rates.provider_rate_date,
    exchange_rates.fetched_at,
    exchange_rates.created_at,
    exchange_rates.updated_at
  from requested_dates
  join public.exchange_rates
    on exchange_rates.rate_date <= requested_dates.as_of_date
   and exchange_rates.to_currency = 'USD'
   and exchange_rates.rate_type = 'valuation'
   and (
     coalesce(array_length(from_currencies, 1), 0) = 0
     or exchange_rates.from_currency = any(from_currencies)
   )
  order by
    requested_dates.as_of_date,
    exchange_rates.from_currency,
    exchange_rates.rate_date desc,
    case when exchange_rates.provider = 'manual' then 0 else 1 end,
    exchange_rates.fetched_at desc nulls last,
    exchange_rates.updated_at desc,
    exchange_rates.created_at desc,
    exchange_rates.id asc;
$$;

revoke all on function public.latest_valuation_rates_to_usd_for_dates(date[], text[]) from public;
revoke all on function public.latest_valuation_rates_to_usd_for_dates(date[], text[]) from anon;
revoke all on function public.latest_valuation_rates_to_usd_for_dates(date[], text[]) from authenticated;
grant execute on function public.latest_valuation_rates_to_usd_for_dates(date[], text[]) to service_role;

create or replace function public.latest_instrument_prices_for_dates(
  as_of_dates date[],
  instrument_ids uuid[] default null
)
returns table (
  as_of_date date,
  id uuid,
  instrument_id uuid,
  price_date date,
  close_price numeric,
  currency text,
  provider text,
  source_symbol text,
  is_adjusted boolean,
  fetched_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_dates as (
    select distinct unnest(as_of_dates) as as_of_date
  ),
  ranked_prices as (
    select
      requested_dates.as_of_date,
      instrument_prices.id,
      instrument_prices.instrument_id,
      instrument_prices.price_date,
      instrument_prices.close_price,
      instrument_prices.currency,
      instrument_prices.provider,
      instrument_prices.source_symbol,
      instrument_prices.is_adjusted,
      instrument_prices.fetched_at,
      instrument_prices.created_at,
      instrument_prices.updated_at,
      dense_rank() over (
        partition by requested_dates.as_of_date, instrument_prices.instrument_id
        order by instrument_prices.price_date desc
      ) as price_date_rank,
      row_number() over (
        partition by requested_dates.as_of_date, instrument_prices.instrument_id, instrument_prices.price_date
        order by
          case when instrument_prices.provider = 'manual' then 0 else 1 end,
          instrument_prices.updated_at desc,
          instrument_prices.created_at desc,
          instrument_prices.id asc
      ) as provider_rank
    from requested_dates
    join public.instrument_prices
      on instrument_prices.price_date <= requested_dates.as_of_date
     and (
       coalesce(array_length(instrument_ids, 1), 0) = 0
       or instrument_prices.instrument_id = any(instrument_ids)
     )
    join public.instruments
      on instruments.id = instrument_prices.instrument_id
     and instruments.currency = instrument_prices.currency
  )
  select
    ranked_prices.as_of_date,
    ranked_prices.id,
    ranked_prices.instrument_id,
    ranked_prices.price_date,
    ranked_prices.close_price,
    ranked_prices.currency,
    ranked_prices.provider,
    ranked_prices.source_symbol,
    ranked_prices.is_adjusted,
    ranked_prices.fetched_at,
    ranked_prices.created_at,
    ranked_prices.updated_at
  from ranked_prices
  where ranked_prices.price_date_rank <= 2
    and ranked_prices.provider_rank = 1
  order by
    ranked_prices.as_of_date,
    ranked_prices.instrument_id,
    ranked_prices.price_date desc;
$$;

revoke all on function public.latest_instrument_prices_for_dates(date[], uuid[]) from public;
revoke all on function public.latest_instrument_prices_for_dates(date[], uuid[]) from anon;
revoke all on function public.latest_instrument_prices_for_dates(date[], uuid[]) from authenticated;
grant execute on function public.latest_instrument_prices_for_dates(date[], uuid[]) to service_role;

create index if not exists transactions_trade_date_created_at_desc_idx
  on public.transactions(trade_date desc, created_at desc);

create index if not exists transactions_account_trade_date_created_at_desc_idx
  on public.transactions(account_id, trade_date desc, created_at desc);

create index if not exists transactions_instrument_trade_date_created_at_desc_idx
  on public.transactions(instrument_id, trade_date desc, created_at desc);

create index if not exists transactions_type_trade_date_created_at_desc_idx
  on public.transactions(transaction_type, trade_date desc, created_at desc);

create index if not exists exchange_rates_rate_date_created_at_desc_idx
  on public.exchange_rates(rate_date desc, created_at desc);

create index if not exists instrument_prices_price_date_created_at_desc_idx
  on public.instrument_prices(price_date desc, created_at desc);
