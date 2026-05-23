create table public.currencies (
  code text primary key,
  name text not null,
  minor_unit integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currencies_code_check check (code in ('NZD', 'USD', 'HKD', 'CNY', 'AUD', 'GBP', 'EUR')),
  constraint currencies_minor_unit_check check (minor_unit >= 0)
);

insert into public.currencies (code, name, minor_unit)
values
  ('USD', 'US Dollar', 2),
  ('NZD', 'New Zealand Dollar', 2),
  ('HKD', 'Hong Kong Dollar', 2),
  ('CNY', 'Chinese Yuan', 2),
  ('AUD', 'Australian Dollar', 2),
  ('GBP', 'British Pound', 2),
  ('EUR', 'Euro', 2)
on conflict (code) do update
set
  name = excluded.name,
  minor_unit = excluded.minor_unit,
  is_active = true;

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  from_currency text not null references public.currencies(code),
  to_currency text not null default 'USD' references public.currencies(code),
  rate numeric(28, 10) not null,
  rate_type text not null default 'valuation',
  provider text not null,
  provider_rate_date date,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exchange_rates_rate_positive_check check (rate > 0),
  constraint exchange_rates_rate_type_check check (rate_type in ('valuation', 'tax')),
  constraint exchange_rates_valuation_to_usd_check check (rate_type <> 'valuation' or to_currency = 'USD'),
  constraint exchange_rates_provider_not_empty_check check (length(btrim(provider)) > 0),
  constraint exchange_rates_pair_type_provider_date_key unique (from_currency, to_currency, rate_type, provider, rate_date)
);

insert into public.exchange_rates (
  rate_date,
  from_currency,
  to_currency,
  rate,
  rate_type,
  provider,
  created_at,
  updated_at
)
select
  rate_date,
  from_currency,
  to_currency,
  rate,
  'valuation',
  coalesce(nullif(btrim(source), ''), 'manual'),
  created_at,
  updated_at
from public.fx_rates
where to_currency = 'USD'
on conflict (from_currency, to_currency, rate_type, provider, rate_date) do nothing;

create table public.instrument_prices (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  price_date date not null,
  close_price numeric(28, 10) not null,
  currency text not null references public.currencies(code),
  provider text not null,
  source_symbol text,
  is_adjusted boolean not null default false,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instrument_prices_close_price_non_negative_check check (close_price >= 0),
  constraint instrument_prices_provider_not_empty_check check (length(btrim(provider)) > 0),
  constraint instrument_prices_instrument_provider_date_key unique (instrument_id, provider, price_date)
);

insert into public.instrument_prices (
  instrument_id,
  price_date,
  close_price,
  currency,
  provider,
  source_symbol,
  is_adjusted,
  created_at,
  updated_at
)
select
  instrument_id,
  price_date,
  close_price,
  currency,
  coalesce(nullif(btrim(source), ''), 'manual'),
  source_symbol,
  is_adjusted,
  created_at,
  updated_at
from public.prices
on conflict (instrument_id, provider, price_date) do nothing;

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null,
  job_started_at timestamptz not null,
  job_finished_at timestamptz,
  records_inserted integer not null default 0,
  records_skipped integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_runs_status_check check (status in ('started', 'succeeded', 'failed')),
  constraint job_runs_job_name_not_empty_check check (length(btrim(job_name)) > 0),
  constraint job_runs_records_inserted_non_negative_check check (records_inserted >= 0),
  constraint job_runs_records_skipped_non_negative_check check (records_skipped >= 0)
);

create table public.data_provider_runs (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references public.job_runs(id) on delete cascade,
  provider text not null,
  data_kind text not null,
  status text not null,
  provider_started_at timestamptz not null,
  provider_finished_at timestamptz,
  records_inserted integer not null default 0,
  records_skipped integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_provider_runs_status_check check (status in ('started', 'succeeded', 'failed')),
  constraint data_provider_runs_data_kind_check check (data_kind in ('exchange_rates', 'instrument_prices')),
  constraint data_provider_runs_provider_not_empty_check check (length(btrim(provider)) > 0),
  constraint data_provider_runs_records_inserted_non_negative_check check (records_inserted >= 0),
  constraint data_provider_runs_records_skipped_non_negative_check check (records_skipped >= 0)
);

create index currencies_is_active_idx on public.currencies(is_active);
create index exchange_rates_pair_type_rate_date_idx on public.exchange_rates(from_currency, to_currency, rate_type, rate_date desc);
create index exchange_rates_rate_date_idx on public.exchange_rates(rate_date);
create index exchange_rates_provider_rate_date_idx on public.exchange_rates(provider, rate_date desc);
create index instrument_prices_instrument_price_date_idx on public.instrument_prices(instrument_id, price_date desc);
create index instrument_prices_price_date_idx on public.instrument_prices(price_date);
create index instrument_prices_provider_price_date_idx on public.instrument_prices(provider, price_date desc);
create index job_runs_job_name_started_at_idx on public.job_runs(job_name, job_started_at desc);
create index job_runs_status_started_at_idx on public.job_runs(status, job_started_at desc);
create index data_provider_runs_job_run_id_idx on public.data_provider_runs(job_run_id);
create index data_provider_runs_provider_kind_started_at_idx on public.data_provider_runs(provider, data_kind, provider_started_at desc);

create trigger currencies_set_updated_at before update on public.currencies for each row execute function public.set_updated_at();
create trigger exchange_rates_set_updated_at before update on public.exchange_rates for each row execute function public.set_updated_at();
create trigger instrument_prices_set_updated_at before update on public.instrument_prices for each row execute function public.set_updated_at();
create trigger job_runs_set_updated_at before update on public.job_runs for each row execute function public.set_updated_at();
create trigger data_provider_runs_set_updated_at before update on public.data_provider_runs for each row execute function public.set_updated_at();

alter table public.currencies enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.instrument_prices enable row level security;
alter table public.job_runs enable row level security;
alter table public.data_provider_runs enable row level security;

create policy currencies_select_family on public.currencies for select to authenticated using (public.has_active_role('viewer'));
create policy currencies_insert_admin on public.currencies for insert to authenticated with check (public.has_active_role('admin'));
create policy currencies_update_admin on public.currencies for update to authenticated using (public.has_active_role('admin')) with check (public.has_active_role('admin'));
create policy currencies_delete_admin on public.currencies for delete to authenticated using (public.has_active_role('admin'));

create policy exchange_rates_select_family on public.exchange_rates for select to authenticated using (public.has_active_role('viewer'));
create policy exchange_rates_insert_admin on public.exchange_rates for insert to authenticated with check (public.has_active_role('admin'));
create policy exchange_rates_update_admin on public.exchange_rates for update to authenticated using (public.has_active_role('admin')) with check (public.has_active_role('admin'));
create policy exchange_rates_delete_admin on public.exchange_rates for delete to authenticated using (public.has_active_role('admin'));

create policy instrument_prices_select_family on public.instrument_prices for select to authenticated using (public.has_active_role('viewer'));
create policy instrument_prices_insert_admin on public.instrument_prices for insert to authenticated with check (public.has_active_role('admin'));
create policy instrument_prices_update_admin on public.instrument_prices for update to authenticated using (public.has_active_role('admin')) with check (public.has_active_role('admin'));
create policy instrument_prices_delete_admin on public.instrument_prices for delete to authenticated using (public.has_active_role('admin'));

create policy job_runs_select_family on public.job_runs for select to authenticated using (public.has_active_role('viewer'));
create policy job_runs_insert_admin on public.job_runs for insert to authenticated with check (public.has_active_role('admin'));
create policy job_runs_update_admin on public.job_runs for update to authenticated using (public.has_active_role('admin')) with check (public.has_active_role('admin'));
create policy job_runs_delete_admin on public.job_runs for delete to authenticated using (public.has_active_role('admin'));

create policy data_provider_runs_select_family on public.data_provider_runs for select to authenticated using (public.has_active_role('viewer'));
create policy data_provider_runs_insert_admin on public.data_provider_runs for insert to authenticated with check (public.has_active_role('admin'));
create policy data_provider_runs_update_admin on public.data_provider_runs for update to authenticated using (public.has_active_role('admin')) with check (public.has_active_role('admin'));
create policy data_provider_runs_delete_admin on public.data_provider_runs for delete to authenticated using (public.has_active_role('admin'));

drop table public.fx_rates cascade;
drop table public.prices cascade;
