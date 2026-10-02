begin;

alter table public.instruments
  drop constraint instruments_price_source_check;

alter table public.instruments
  add constraint instruments_price_source_check check (
    price_source in (
      'manual',
      'yahoo_finance',
      'alpha_vantage',
      'stooq',
      'twelvedata',
      'eastmoney',
      'sina',
      'investnow_manual',
      'custom',
      'kernel_estimate'
    )
  );

alter table public.instrument_prices
  add column is_estimated boolean not null default false;

create table public.kernel_price_anchors (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  anchor_date date not null,
  kernel_unit_price numeric(28, 10) not null,
  proxy_symbol text not null,
  proxy_currency text not null references public.currencies(code),
  proxy_close numeric(28, 10) not null,
  proxy_price_date date not null,
  proxy_fetched_at timestamptz not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint kernel_price_anchors_unit_price_positive_check check (
    kernel_unit_price > 0
    and kernel_unit_price::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint kernel_price_anchors_proxy_symbol_not_empty_check check (
    length(btrim(proxy_symbol)) > 0
  ),
  constraint kernel_price_anchors_proxy_close_positive_check check (
    proxy_close > 0
    and proxy_close::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint kernel_price_anchors_proxy_date_matches_check check (
    proxy_price_date = anchor_date
  ),
  constraint kernel_price_anchors_idempotency_key unique (
    instrument_id,
    anchor_date,
    kernel_unit_price,
    proxy_symbol,
    proxy_currency,
    proxy_close
  )
);

create index kernel_price_anchors_instrument_date_created_idx
  on public.kernel_price_anchors(instrument_id, anchor_date desc, created_at desc, id desc);

alter table public.kernel_price_anchors enable row level security;

create policy kernel_price_anchors_select_family
  on public.kernel_price_anchors
  for select
  to authenticated
  using (public.has_active_role('viewer'));

revoke all on table public.kernel_price_anchors from anon, authenticated;
grant select on table public.kernel_price_anchors to authenticated;
grant select on table public.kernel_price_anchors to service_role;

insert into public.instruments (
  symbol,
  short_name,
  name,
  description,
  market_region,
  exchange,
  currency,
  asset_type,
  isin,
  provider,
  price_source,
  price_source_symbol,
  price_source_exchange,
  price_update_enabled,
  price_update_priority,
  source_url,
  source_checked_at,
  notes
)
values (
  'KERNEL_SP500_UNHEDGED',
  'Kernel 标普500（非对冲）',
  'Kernel S&P 500 (Unhedged) Fund',
  'Kernel S&P 500 (Unhedged) Fund is a New Zealand PIE fund whose unit price is estimated between manual anchors using the raw NZX close of Smart US 500 ETF (USF).',
  'NZ',
  'KERNEL',
  'NZD',
  'pie_fund',
  null,
  'Kernel',
  'kernel_estimate',
  'USF.NZ',
  'NZX',
  false,
  3,
  'https://kernelwealth.co.nz/funds/sp-500-unhedged',
  now(),
  'Estimated from USF.NZ daily movement between exact Kernel unit-price anchors.'
)
on conflict (market_region, exchange, symbol)
do update set
  short_name = excluded.short_name,
  name = excluded.name,
  description = excluded.description,
  currency = excluded.currency,
  asset_type = excluded.asset_type,
  provider = excluded.provider,
  price_source = excluded.price_source,
  price_source_symbol = excluded.price_source_symbol,
  price_source_exchange = excluded.price_source_exchange,
  price_update_priority = excluded.price_update_priority,
  source_url = excluded.source_url,
  source_checked_at = excluded.source_checked_at,
  notes = excluded.notes,
  updated_at = now();

create function public.save_kernel_price_anchor(
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
    or p_proxy_price_date is distinct from p_anchor_date then
    raise exception 'Proxy price date must match the anchor date.' using errcode = '22023';
  end if;

  if p_kernel_unit_price is null
    or p_kernel_unit_price <= 0
    or p_kernel_unit_price::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Kernel unit price must be a positive finite number.' using errcode = '22023';
  end if;

  if p_proxy_close is null
    or p_proxy_close <= 0
    or p_proxy_close::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Proxy close must be a positive finite number.' using errcode = '22023';
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
       and proxy_close = p_proxy_close;

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

  select coalesce(max(estimate.price_date), p_anchor_date)
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

revoke all on function public.save_kernel_price_anchor(
  uuid,
  date,
  numeric,
  text,
  text,
  numeric,
  date,
  timestamptz,
  uuid,
  jsonb
) from public, anon, authenticated;
grant execute on function public.save_kernel_price_anchor(
  uuid,
  date,
  numeric,
  text,
  text,
  numeric,
  date,
  timestamptz,
  uuid,
  jsonb
) to service_role;

drop function public.latest_instrument_prices_for_dates(date[], uuid[]);

create function public.latest_instrument_prices_for_dates(
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
  is_estimated boolean,
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
      instrument_prices.is_estimated,
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
          case
            when instrument_prices.provider = 'manual' then 0
            when not instrument_prices.is_estimated then 1
            else 2
          end,
          instrument_prices.provider asc,
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
    ranked_prices.is_estimated,
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

revoke all on function public.latest_instrument_prices_for_dates(date[], uuid[]) from public, anon, authenticated;
grant execute on function public.latest_instrument_prices_for_dates(date[], uuid[]) to service_role;

create or replace function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'spending_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.spending_accounts t), '[]'::jsonb),
    'account_statements', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.account_statements t), '[]'::jsonb),
    'statement_rows', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('amount', t.amount::text) order by t.id) from public.statement_rows t), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.profiles t), '[]'::jsonb),
    'user_roles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.user_roles t), '[]'::jsonb),
    'currencies', coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from public.currencies t), '[]'::jsonb),
    'investment_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.investment_accounts t), '[]'::jsonb),
    'instruments', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instruments t), '[]'::jsonb),
    'kernel_price_anchors', coalesce((select jsonb_agg(
      to_jsonb(t) || jsonb_build_object(
        'kernel_unit_price', t.kernel_unit_price::text,
        'proxy_close', t.proxy_close::text
      ) order by t.id
    ) from public.kernel_price_anchors t), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.transactions t), '[]'::jsonb),
    'exchange_rates', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.exchange_rates t), '[]'::jsonb),
    'instrument_prices', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instrument_prices t), '[]'::jsonb),
    'portfolio_snapshot_headers', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.portfolio_snapshot_headers t), '[]'::jsonb),
    'portfolio_account_snapshots', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.portfolio_account_snapshots t), '[]'::jsonb),
    'dashboard_instrument_quotes', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.dashboard_instrument_quotes t), '[]'::jsonb),
    'monthly_reviews', coalesce((select jsonb_agg(to_jsonb(t) order by t.month) from public.monthly_reviews t), '[]'::jsonb),
    'job_runs', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.job_runs t where excluded_job_run_id is null or t.id <> excluded_job_run_id), '[]'::jsonb),
    'data_provider_runs', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.data_provider_runs t), '[]'::jsonb)
  );
$$;

revoke all on function public.export_ledger_backup(uuid) from public, anon, authenticated;
grant execute on function public.export_ledger_backup(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
