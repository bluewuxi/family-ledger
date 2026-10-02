begin;

alter table public.kernel_price_anchors
  drop constraint kernel_price_anchors_proxy_date_matches_check;

alter table public.kernel_price_anchors
  add constraint kernel_price_anchors_proxy_date_after_anchor_check check (
    proxy_price_date > anchor_date
  ) not valid;

alter table public.kernel_price_anchors
  drop constraint kernel_price_anchors_idempotency_key;

alter table public.kernel_price_anchors
  add constraint kernel_price_anchors_idempotency_key unique (
    instrument_id,
    anchor_date,
    kernel_unit_price,
    proxy_symbol,
    proxy_currency,
    proxy_close,
    proxy_price_date
  );

comment on column public.kernel_price_anchors.proxy_close is
  'Legacy column name. Stores the raw USF.NZ opening price for proxy_price_date.';

update public.instruments
   set description = 'Kernel S&P 500 (Unhedged) Fund is a New Zealand PIE fund whose unit price is estimated between manual anchors using the raw opening price from the next NZX trading session of Smart US 500 ETF (USF).',
       notes = 'Estimated from USF.NZ raw opening-price movement. Each Kernel valuation date is paired with the first later confirmed NZX trading session.',
       source_checked_at = now(),
       updated_at = now()
 where symbol = 'KERNEL_SP500_UNHEDGED'
   and market_region = 'NZ'
   and exchange = 'KERNEL';
create or replace function public.save_kernel_price_anchor(
  p_target_instrument_id uuid,
  p_anchor_date date,
  p_kernel_unit_price numeric,
  p_proxy_symbol text,
  p_proxy_currency text,
  p_proxy_close numeric,
  p_proxy_price_date date,
  p_proxy_fetched_at timestamptz,
  p_created_by_user_id uuid,
  p_estimates jsonb default '[]'::jsonb
)
returns public.kernel_price_anchors
language plpgsql
security definer
set search_path = public
as $$
declare
  target_instrument public.instruments%rowtype;
  saved_anchor public.kernel_price_anchors%rowtype;
  first_anchor boolean;
  replace_through_date date;
begin
  if p_anchor_date is null
    or p_proxy_price_date is null
    or p_proxy_price_date <= p_anchor_date then
    raise exception 'Proxy price date must be after the Kernel valuation date.' using errcode = '22023';
  end if;

  if p_kernel_unit_price is null
    or p_kernel_unit_price <= 0
    or p_kernel_unit_price::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Kernel unit price must be a positive finite number.' using errcode = '22023';
  end if;

  if p_proxy_close is null
    or p_proxy_close <= 0
    or p_proxy_close::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Proxy opening price must be a positive finite number.' using errcode = '22023';
  end if;

  if p_proxy_fetched_at is null then
    raise exception 'Proxy fetch time is required.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_estimates) is distinct from 'array' then
    raise exception 'Kernel estimates must be a JSON array.' using errcode = '22023';
  end if;

  select *
    into target_instrument
    from public.instruments
   where id = p_target_instrument_id
   for update;

  if not found then
    raise exception 'Kernel target instrument was not found.' using errcode = 'P0002';
  end if;

  if target_instrument.symbol is distinct from 'KERNEL_SP500_UNHEDGED'
    or target_instrument.market_region is distinct from 'NZ'
    or target_instrument.exchange is distinct from 'KERNEL'
    or target_instrument.currency is distinct from 'NZD'
    or target_instrument.asset_type is distinct from 'pie_fund'
    or target_instrument.price_source is distinct from 'kernel_estimate'
    or target_instrument.price_source_symbol is distinct from btrim(p_proxy_symbol)
    or target_instrument.price_source_exchange is distinct from 'NZX'
    or p_proxy_currency is distinct from 'NZD' then
    raise exception 'Kernel target or proxy configuration is invalid.' using errcode = '23514';
  end if;

  if p_created_by_user_id is null
    or not exists (select 1 from auth.users where id = p_created_by_user_id) then
    raise exception 'Anchor creator must be an existing Supabase Auth user.' using errcode = '23503';
  end if;

  select not exists (
    select 1
      from public.kernel_price_anchors
     where instrument_id = p_target_instrument_id
  ) into first_anchor;

  insert into public.kernel_price_anchors (
    instrument_id,
    anchor_date,
    kernel_unit_price,
    proxy_symbol,
    proxy_currency,
    proxy_close,
    proxy_price_date,
    proxy_fetched_at,
    created_by_user_id
  )
  values (
    p_target_instrument_id,
    p_anchor_date,
    p_kernel_unit_price,
    btrim(p_proxy_symbol),
    p_proxy_currency,
    p_proxy_close,
    p_proxy_price_date,
    p_proxy_fetched_at,
    p_created_by_user_id
  )
  on conflict on constraint kernel_price_anchors_idempotency_key do nothing
  returning * into saved_anchor;

  if saved_anchor.id is null then
    select *
      into saved_anchor
      from public.kernel_price_anchors
     where instrument_id = p_target_instrument_id
       and anchor_date = p_anchor_date
       and kernel_unit_price = p_kernel_unit_price
       and proxy_symbol = btrim(p_proxy_symbol)
       and proxy_currency = p_proxy_currency
       and proxy_close = p_proxy_close
       and proxy_price_date = p_proxy_price_date;

    return saved_anchor;
  end if;

  insert into public.instrument_prices (
    instrument_id,
    price_date,
    close_price,
    currency,
    provider,
    source_symbol,
    is_adjusted,
    is_estimated,
    fetched_at
  )
  values (
    p_target_instrument_id,
    p_anchor_date,
    p_kernel_unit_price,
    target_instrument.currency,
    'Kernel Anchor',
    target_instrument.symbol,
    false,
    false,
    p_proxy_fetched_at
  )
  on conflict (instrument_id, provider, price_date)
  do update set
    close_price = excluded.close_price,
    currency = excluded.currency,
    source_symbol = excluded.source_symbol,
    is_adjusted = false,
    is_estimated = false,
    fetched_at = excluded.fetched_at,
    updated_at = now();

  if exists (
    select 1
      from jsonb_array_elements(p_estimates) as estimate(value)
     where jsonb_typeof(estimate.value) is distinct from 'object'
        or not (estimate.value ? 'price_date')
        or not (estimate.value ? 'close_price')
        or not (estimate.value ? 'fetched_at')
  ) then
    raise exception 'Each Kernel estimate requires price_date, close_price, and fetched_at.' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_estimates) as estimate(
        price_date date,
        close_price numeric,
        fetched_at timestamptz
      )
     where estimate.price_date is null
        or estimate.price_date < p_anchor_date
        or estimate.close_price is null
        or estimate.close_price <= 0
        or estimate.close_price::text in ('NaN', 'Infinity', '-Infinity')
        or estimate.fetched_at is null
  ) then
    raise exception 'Kernel estimates contain an invalid date, price, or fetch time.' using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct estimate.price_date)
      from jsonb_to_recordset(p_estimates) as estimate(price_date date)
  ) then
    raise exception 'Kernel estimates contain duplicate price dates.' using errcode = '22023';
  end if;

  select coalesce(max(estimate.price_date), p_proxy_price_date)
    into replace_through_date
    from jsonb_to_recordset(p_estimates) as estimate(price_date date);

  delete from public.instrument_prices
   where instrument_id = p_target_instrument_id
     and provider = 'Kernel Estimate (USF.NZ)'
     and price_date between p_anchor_date and replace_through_date;

  insert into public.instrument_prices (
    instrument_id,
    price_date,
    close_price,
    currency,
    provider,
    source_symbol,
    is_adjusted,
    is_estimated,
    fetched_at
  )
  select
    p_target_instrument_id,
    estimate.price_date,
    round(estimate.close_price, 10),
    target_instrument.currency,
    'Kernel Estimate (USF.NZ)',
    btrim(p_proxy_symbol),
    false,
    true,
    estimate.fetched_at
  from jsonb_to_recordset(p_estimates) as estimate(
    price_date date,
    close_price numeric,
    fetched_at timestamptz
  )
  where not exists (
    select 1
      from public.kernel_price_anchors anchor
     where anchor.instrument_id = p_target_instrument_id
       and anchor.anchor_date = estimate.price_date
  );

  if first_anchor then
    update public.instruments
       set price_update_enabled = true,
           updated_at = now()
     where id = p_target_instrument_id;
  end if;

  return saved_anchor;
end;
$$;
commit;
