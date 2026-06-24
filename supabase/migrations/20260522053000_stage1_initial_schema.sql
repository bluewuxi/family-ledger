create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  preferred_currency text not null default 'NZD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_preferred_currency_check check (preferred_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR'))
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_role_check check (role in ('viewer', 'admin')),
  constraint user_roles_user_id_key unique (user_id)
);

create table public.investment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  broker text,
  account_type text not null,
  base_currency text not null default 'NZD',
  market_region text not null default 'OTHER',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_accounts_account_type_check check (account_type in ('brokerage', 'fund_platform', 'bank', 'retirement', 'other')),
  constraint investment_accounts_base_currency_check check (base_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
  constraint investment_accounts_market_region_check check (market_region in ('US', 'HK', 'CN', 'NZ', 'MULTI', 'OTHER'))
);

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text,
  name text not null,
  market text not null,
  currency text not null,
  asset_type text not null,
  isin text,
  provider text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instruments_market_check check (market in ('US', 'HK', 'CN', 'NZ', 'MULTI', 'OTHER')),
  constraint instruments_currency_check check (currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
  constraint instruments_asset_type_check check (asset_type in ('stock', 'etf', 'pie_fund', 'mutual_fund', 'cash', 'bond', 'other'))
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.investment_accounts(id) on delete restrict,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  transaction_type text not null,
  trade_date date not null,
  settlement_date date,
  quantity numeric(28, 10),
  price numeric(28, 10),
  gross_amount numeric(28, 6),
  fee numeric(28, 6) not null default 0,
  tax numeric(28, 6) not null default 0,
  currency text not null,
  fx_rate_to_nzd numeric(28, 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_transaction_type_check check (transaction_type in ('buy', 'sell', 'dividend', 'fee', 'tax', 'deposit', 'withdrawal', 'interest', 'adjustment')),
  constraint transactions_currency_check check (currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
  constraint transactions_quantity_non_negative_check check (quantity is null or quantity >= 0),
  constraint transactions_price_non_negative_check check (price is null or price >= 0),
  constraint transactions_gross_amount_non_negative_check check (gross_amount is null or gross_amount >= 0),
  constraint transactions_fee_non_negative_check check (fee >= 0),
  constraint transactions_tax_non_negative_check check (tax >= 0),
  constraint transactions_fx_rate_positive_check check (fx_rate_to_nzd is null or fx_rate_to_nzd > 0)
);

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  price_date date not null,
  close_price numeric(28, 10) not null,
  currency text not null,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prices_close_price_non_negative_check check (close_price >= 0),
  constraint prices_currency_check check (currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
  constraint prices_user_instrument_date_key unique (user_id, instrument_id, price_date)
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rate_date date not null,
  from_currency text not null,
  to_currency text not null default 'NZD',
  rate numeric(28, 10) not null,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fx_rates_from_currency_check check (from_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
  constraint fx_rates_to_currency_check check (to_currency in ('NZD', 'USD', 'HKD', 'CNY', 'GBP', 'EUR')),
  constraint fx_rates_rate_positive_check check (rate > 0),
  constraint fx_rates_user_pair_date_key unique (user_id, from_currency, to_currency, rate_date)
);

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  total_market_value_nzd numeric(28, 6),
  total_cost_nzd numeric(28, 6),
  unrealized_gain_nzd numeric(28, 6),
  daily_change_nzd numeric(28, 6),
  daily_change_pct numeric(18, 8),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_snapshots_total_market_value_non_negative_check check (total_market_value_nzd is null or total_market_value_nzd >= 0),
  constraint portfolio_snapshots_total_cost_non_negative_check check (total_cost_nzd is null or total_cost_nzd >= 0),
  constraint portfolio_snapshots_user_date_key unique (user_id, snapshot_date)
);

create index profiles_id_idx on public.profiles(id);
create index user_roles_user_id_idx on public.user_roles(user_id);
create index investment_accounts_user_id_idx on public.investment_accounts(user_id);
create index investment_accounts_user_account_type_idx on public.investment_accounts(user_id, account_type);
create index instruments_user_market_symbol_idx on public.instruments(user_id, market, symbol);
create index instruments_user_asset_type_idx on public.instruments(user_id, asset_type);
create index transactions_user_trade_date_idx on public.transactions(user_id, trade_date);
create index transactions_account_trade_date_idx on public.transactions(account_id, trade_date);
create index transactions_instrument_trade_date_idx on public.transactions(instrument_id, trade_date);
create index transactions_user_type_trade_date_idx on public.transactions(user_id, transaction_type, trade_date);
create index prices_instrument_price_date_idx on public.prices(instrument_id, price_date);
create index prices_user_price_date_idx on public.prices(user_id, price_date);
create index fx_rates_user_pair_rate_date_idx on public.fx_rates(user_id, from_currency, to_currency, rate_date);
create index portfolio_snapshots_user_snapshot_date_idx on public.portfolio_snapshots(user_id, snapshot_date);

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger user_roles_set_updated_at before update on public.user_roles for each row execute function public.set_updated_at();
create trigger investment_accounts_set_updated_at before update on public.investment_accounts for each row execute function public.set_updated_at();
create trigger instruments_set_updated_at before update on public.instruments for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger prices_set_updated_at before update on public.prices for each row execute function public.set_updated_at();
create trigger fx_rates_set_updated_at before update on public.fx_rates for each row execute function public.set_updated_at();
create trigger portfolio_snapshots_set_updated_at before update on public.portfolio_snapshots for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.investment_accounts enable row level security;
alter table public.instruments enable row level security;
alter table public.transactions enable row level security;
alter table public.prices enable row level security;
alter table public.fx_rates enable row level security;
alter table public.portfolio_snapshots enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy user_roles_select_own on public.user_roles for select to authenticated using (auth.uid() = user_id);

create policy investment_accounts_select_own on public.investment_accounts for select to authenticated using (auth.uid() = user_id);
create policy investment_accounts_insert_own on public.investment_accounts for insert to authenticated with check (auth.uid() = user_id);
create policy investment_accounts_update_own on public.investment_accounts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy investment_accounts_delete_own on public.investment_accounts for delete to authenticated using (auth.uid() = user_id);

create policy instruments_select_own on public.instruments for select to authenticated using (auth.uid() = user_id);
create policy instruments_insert_own on public.instruments for insert to authenticated with check (auth.uid() = user_id);
create policy instruments_update_own on public.instruments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy instruments_delete_own on public.instruments for delete to authenticated using (auth.uid() = user_id);

create policy transactions_select_own on public.transactions for select to authenticated using (auth.uid() = user_id);
create policy transactions_insert_own on public.transactions for insert to authenticated with check (auth.uid() = user_id);
create policy transactions_update_own on public.transactions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_delete_own on public.transactions for delete to authenticated using (auth.uid() = user_id);

create policy prices_select_own on public.prices for select to authenticated using (auth.uid() = user_id);
create policy prices_insert_own on public.prices for insert to authenticated with check (auth.uid() = user_id);
create policy prices_update_own on public.prices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prices_delete_own on public.prices for delete to authenticated using (auth.uid() = user_id);

create policy fx_rates_select_own on public.fx_rates for select to authenticated using (auth.uid() = user_id);
create policy fx_rates_insert_own on public.fx_rates for insert to authenticated with check (auth.uid() = user_id);
create policy fx_rates_update_own on public.fx_rates for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy fx_rates_delete_own on public.fx_rates for delete to authenticated using (auth.uid() = user_id);

create policy portfolio_snapshots_select_own on public.portfolio_snapshots for select to authenticated using (auth.uid() = user_id);
create policy portfolio_snapshots_insert_own on public.portfolio_snapshots for insert to authenticated with check (auth.uid() = user_id);
create policy portfolio_snapshots_update_own on public.portfolio_snapshots for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy portfolio_snapshots_delete_own on public.portfolio_snapshots for delete to authenticated using (auth.uid() = user_id);
