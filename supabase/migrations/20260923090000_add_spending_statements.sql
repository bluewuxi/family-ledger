create table public.spending_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  institution text not null default '',
  default_currency text not null check (default_currency in ('CNY','NZD','USD','JPY','HKD','GBP','EUR','AUD')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id), updated_by_user_id uuid references auth.users(id)
);
create table public.account_statements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.spending_accounts(id),
  month date not null, statement_date date not null, period_start date not null, period_end date not null,
  currency text not null check (currency in ('CNY','NZD','USD','JPY','HKD','GBP','EUR','AUD')),
  status text not null default 'entering' check (status in ('entering','complete')),
  source_file_key text, source_file_version text, source_file_name text, source_file_size integer, file_sha256 text,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id), updated_by_user_id uuid references auth.users(id),
  unique(account_id, statement_date),
  check (month = date_trunc('month', statement_date)::date),
  check (period_start <= period_end),
  check ((source_file_key is null and source_file_version is null and source_file_name is null and source_file_size is null and file_sha256 is null)
    or (source_file_key is not null and source_file_version is not null and source_file_name is not null and source_file_size is not null and source_file_size between 5 and 10485760 and file_sha256 is not null and file_sha256 ~ '^[0-9a-f]{64}$'))
);
create table public.statement_rows (
  id uuid primary key default gen_random_uuid(), statement_id uuid not null references public.account_statements(id) on delete cascade,
  row_number integer not null check (row_number > 0), suffix_number text check (suffix_number ~ '^[0-9]{4}$'),
  transaction_date date not null, posting_date date not null,
  description text not null check (length(btrim(description)) between 1 and 1000),
  transaction_type text not null check (transaction_type in ('purchase','refund','repayment','cashback','fee','interest','cash_advance','adjustment')),
  is_spending boolean not null,
  original_currency text not null check (original_currency in ('CNY','NZD','USD','JPY','HKD','GBP','EUR','AUD')),
  original_amount numeric(20,6) not null, settlement_amount numeric(20,6) not null,
  tag text check (tag is null or length(btrim(tag)) between 1 and 80), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id), updated_by_user_id uuid references auth.users(id),
  unique(statement_id, row_number),
  check ((transaction_type in ('purchase','fee','interest','cash_advance') and settlement_amount > 0 and original_amount > 0)
    or (transaction_type in ('refund','repayment','cashback') and settlement_amount < 0 and original_amount < 0)
    or transaction_type = 'adjustment')
);
create index on public.account_statements(month, account_id);
create index on public.statement_rows(transaction_date desc, id desc);
create index on public.statement_rows(suffix_number);
create index on public.statement_rows(tag);

-- Parent locking serializes numbering and prevents currency changes racing row inserts.
create function public.guard_spending_statement() returns trigger language plpgsql set search_path = public as $$
begin
  if (new.account_id, new.currency) is distinct from (old.account_id, old.currency)
    and exists (select 1 from statement_rows where statement_id = old.id) then
    raise exception 'Statement with rows cannot change account or currency' using errcode = '23514';
  end if;
  if (new.statement_date,new.period_start,new.period_end,new.currency,new.account_id)
    is distinct from (old.statement_date,old.period_start,old.period_end,old.currency,old.account_id) then
    new.status := 'entering';
  end if;
  return new;
end $$;
create trigger guard_spending_statement before update on public.account_statements for each row execute function public.guard_spending_statement();
create function public.guard_spending_row() returns trigger language plpgsql set search_path = public as $$
declare sid uuid;
begin
  if tg_op = 'DELETE' then sid := old.statement_id; else sid := new.statement_id; end if;
  perform 1 from account_statements where id = sid for update;
  if tg_op = 'INSERT' then
    new.is_spending := coalesce(new.is_spending, new.settlement_amount > 0);
    select coalesce(max(row_number),0)+1 into new.row_number from statement_rows where statement_id = sid;
  elsif tg_op = 'UPDATE' then
    if (new.statement_id,new.row_number) is distinct from (old.statement_id,old.row_number) then
      raise exception 'Cannot move a statement row' using errcode = '23514';
    end if;
    if (new.transaction_date,new.posting_date,new.description,new.transaction_type,new.original_currency,new.original_amount,new.settlement_amount,new.suffix_number,new.is_spending)
      is not distinct from (old.transaction_date,old.posting_date,old.description,old.transaction_type,old.original_currency,old.original_amount,old.settlement_amount,old.suffix_number,old.is_spending) then
      return new;
    end if;
  end if;
  update account_statements set status = 'entering', updated_by_user_id = case when tg_op = 'DELETE' then old.updated_by_user_id else new.updated_by_user_id end where id = sid;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_spending_row before insert or update or delete on public.statement_rows for each row execute function public.guard_spending_row();

do $$ declare t text; begin
  foreach t in array array['spending_accounts','account_statements','statement_rows'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy read_family on public.%I for select to authenticated using (public.has_active_role(''viewer''))',t);
    -- All writes pass through the API; no browser business-table writes.
    execute format('revoke insert, update, delete on public.%I from authenticated, anon',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

-- Cast decimals before JSON serialization, preserving numeric precision in clients.
create view public.spending_row_details with (security_invoker = true) as
select r.id,r.statement_id,r.row_number,r.suffix_number,r.transaction_date,r.posting_date,r.description,r.transaction_type,r.is_spending,
 r.original_currency,r.original_amount::text,r.settlement_amount::text,r.tag,r.notes,
 s.currency,s.account_id,a.name account_name,s.month statement_month,s.status statement_status
from public.statement_rows r join public.account_statements s on s.id=r.statement_id join public.spending_accounts a on a.id=s.account_id;
create view public.spending_statement_details with (security_invoker = true) as
select s.id,s.account_id,s.month,s.statement_date,s.period_start,s.period_end,s.currency,
 s.status,
 s.source_file_key,s.source_file_version,s.source_file_name,s.source_file_size,s.file_sha256,s.notes,a.name account_name,
 (select count(*)::integer from public.statement_rows r where r.statement_id=s.id) row_count
from public.account_statements s join public.spending_accounts a on a.id=s.account_id;
grant select on public.spending_row_details, public.spending_statement_details to service_role;

create function public.query_spending_rows(filters jsonb) returns jsonb language sql stable security invoker set search_path = public as $$
with matched as materialized (
 select * from spending_row_details r where
 (filters->>'from' is null or r.transaction_date >= (filters->>'from')::date) and
 (filters->>'to' is null or r.transaction_date <= (filters->>'to')::date) and
 (filters->>'accountId' is null or r.account_id = (filters->>'accountId')::uuid) and
 (filters->>'statementId' is null or r.statement_id = (filters->>'statementId')::uuid) and
 (filters->>'statementMonth' is null or r.statement_month = (filters->>'statementMonth')::date) and
 (filters->>'suffixNumber' is null or r.suffix_number = filters->>'suffixNumber') and
 (filters->>'tag' is null or r.tag = filters->>'tag') and
 (coalesce(filters->>'untagged','false') <> 'true' or r.tag is null) and
 (filters->>'transactionType' is null or r.transaction_type = filters->>'transactionType') and
 (filters->>'isSpending' is null or r.is_spending = (filters->>'isSpending')::boolean) and
 (filters->>'currency' is null or r.currency = filters->>'currency') and
 (filters->>'q' is null or position(lower(filters->>'q') in lower(r.description)) > 0)
), grouped as (
 select currency, date_trunc('month',transaction_date)::date::text month_label, tag,
 grouping(date_trunc('month',transaction_date)::date::text) gm, grouping(tag) gt,
 count(*) count,
 count(*) filter(where is_spending) spending_count,
 coalesce(sum(settlement_amount::numeric) filter(where is_spending and settlement_amount::numeric > 0),0)::text included_positive,
 coalesce(sum(settlement_amount::numeric) filter(where is_spending and settlement_amount::numeric < 0),0)::text included_negative,
 coalesce(sum(settlement_amount::numeric) filter(where is_spending),0)::text net_spending,
 coalesce(sum(settlement_amount::numeric) filter(where not is_spending),0)::text excluded_amount
 from matched group by grouping sets ((currency),(currency,date_trunc('month',transaction_date)::date::text),(currency,tag))
), page as (
 select * from matched order by transaction_date desc,id desc limit (filters->>'limit')::int offset (filters->>'offset')::int
)
select jsonb_build_object(
 'rows',coalesce((select jsonb_agg(to_jsonb(p) order by transaction_date desc,id desc) from page p),'[]'::jsonb),
 'pagination',jsonb_build_object('limit',(filters->>'limit')::int,'offset',(filters->>'offset')::int,'total',(select count(*) from matched),'hasMore',(select count(*) from matched) > (filters->>'offset')::int + (filters->>'limit')::int),
 'entering_count',(select count(distinct statement_id) from matched where statement_status='entering'),
 'totals',coalesce((select jsonb_agg(to_jsonb(g)-'gm'-'gt'-'tag'-'month_label' order by currency) from grouped g where gm=1 and gt=1),'[]'::jsonb),
 'monthly',coalesce((select jsonb_agg((to_jsonb(g)-'gm'-'gt'-'tag'-'month_label') || jsonb_build_object('label',month_label) order by month_label,currency) from grouped g where gm=0),'[]'::jsonb),
 'tags',coalesce((select jsonb_agg((to_jsonb(g)-'gm'-'gt'-'tag'-'month_label') || jsonb_build_object('label',tag) order by tag,currency) from grouped g where gt=0),'[]'::jsonb)
);
$$;
create function public.spending_filter_options(account_id_filter uuid default null) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'tags',coalesce(jsonb_agg(distinct tag order by tag) filter(where tag is not null),'[]'::jsonb),
 'suffixes',coalesce(jsonb_agg(distinct suffix_number order by suffix_number) filter(where suffix_number is not null),'[]'::jsonb))
 from spending_row_details where account_id_filter is null or account_id=account_id_filter;
$$;
revoke all on function public.query_spending_rows(jsonb), public.spending_filter_options(uuid) from public,anon,authenticated;
grant execute on function public.query_spending_rows(jsonb), public.spending_filter_options(uuid) to service_role;

-- Record the deleting operator on the parent in the same transaction as row removal.
create function public.delete_spending_row(target_id uuid, actor_id uuid) returns boolean language plpgsql security invoker set search_path=public as $$
declare sid uuid;
begin
  select statement_id into sid from statement_rows where id=target_id;
  if sid is null then return false; end if;
  perform 1 from account_statements where id=sid for update;
  update statement_rows set updated_by_user_id=actor_id where id=target_id;
  delete from statement_rows where id=target_id;
  return found;
end $$;
revoke all on function public.delete_spending_row(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_spending_row(uuid,uuid) to service_role;

create or replace function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'spending_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.spending_accounts t), '[]'::jsonb),
    'account_statements', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.account_statements t), '[]'::jsonb),
    'statement_rows', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.statement_rows t), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.profiles t), '[]'::jsonb),
    'user_roles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.user_roles t), '[]'::jsonb),
    'currencies', coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from public.currencies t), '[]'::jsonb),
    'investment_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.investment_accounts t), '[]'::jsonb),
    'instruments', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.instruments t), '[]'::jsonb),
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
