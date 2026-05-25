create table public.dashboard_instrument_quotes (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  quote_date date not null,
  quote_price numeric(28, 10) not null,
  currency text not null references public.currencies(code),
  provider text not null,
  source_symbol text,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_instrument_quotes_price_non_negative_check check (quote_price >= 0),
  constraint dashboard_instrument_quotes_provider_not_empty_check check (length(btrim(provider)) > 0),
  constraint dashboard_instrument_quotes_instrument_provider_key unique (instrument_id, provider)
);

create index dashboard_instrument_quotes_instrument_fetched_at_idx
  on public.dashboard_instrument_quotes(instrument_id, fetched_at desc);

create index dashboard_instrument_quotes_provider_fetched_at_idx
  on public.dashboard_instrument_quotes(provider, fetched_at desc);

create trigger dashboard_instrument_quotes_set_updated_at
  before update on public.dashboard_instrument_quotes
  for each row execute function public.set_updated_at();

alter table public.dashboard_instrument_quotes enable row level security;

create policy dashboard_instrument_quotes_select_family
  on public.dashboard_instrument_quotes for select to authenticated
  using (public.has_active_role('viewer'));

create policy dashboard_instrument_quotes_insert_admin
  on public.dashboard_instrument_quotes for insert to authenticated
  with check (public.has_active_role('admin'));

create policy dashboard_instrument_quotes_update_admin
  on public.dashboard_instrument_quotes for update to authenticated
  using (public.has_active_role('admin')) with check (public.has_active_role('admin'));

create policy dashboard_instrument_quotes_delete_admin
  on public.dashboard_instrument_quotes for delete to authenticated
  using (public.has_active_role('admin'));
