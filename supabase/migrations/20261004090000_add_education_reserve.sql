begin;

create table public.education_reserve_funds (
 id uuid primary key default gen_random_uuid(), singleton_key text not null default 'education' unique check(singleton_key='education'),
 name text not null default '教育储备' check(length(btrim(name)) between 1 and 120),
 legacy_account_id uuid references public.investment_accounts(id), cutover_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by_user_id uuid references auth.users(id), updated_by_user_id uuid references auth.users(id)
);
create table public.education_reserve_entries (
 id uuid primary key default gen_random_uuid(), fund_id uuid not null references public.education_reserve_funds(id),
 entry_date date not null, entry_type text not null check(entry_type in ('opening_balance','contribution','expense','refund','withdrawal','exchange')),
 currency text not null check(currency in ('CNY','NZD','USD','JPY','HKD','GBP','EUR','AUD')),
 amount numeric(20,6) not null check(amount>0),
 expense_category text check(expense_category in ('tuition','accommodation','living_allowance','other')),
 related_expense_id uuid references public.education_reserve_entries(id) deferrable initially deferred,
 target_currency text check(target_currency in ('CNY','NZD','USD','JPY','HKD','GBP','EUR','AUD')),
 target_amount numeric(20,6) check(target_amount>0), notes text check(length(notes)<=4000),
 version integer not null default 1 check(version>0), legacy_transaction_id uuid unique references public.transactions(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by_user_id uuid references auth.users(id), updated_by_user_id uuid references auth.users(id),
 check((entry_type in ('expense','refund') and expense_category is not null) or (entry_type not in ('expense','refund') and expense_category is null)),
 check((entry_type='exchange' and target_currency is not null and target_currency<>currency and target_amount is not null)
   or (entry_type<>'exchange' and target_currency is null and target_amount is null)),
 check(related_expense_id is null or (entry_type='refund' and related_expense_id<>id))
);
create index on public.education_reserve_entries(fund_id,entry_date desc,id desc);
create index on public.education_reserve_entries(fund_id,currency,entry_date);
insert into public.education_reserve_funds(singleton_key,cutover_at)
 select 'education',case when exists(select 1 from investment_accounts where purpose='education') then null else now() end;

do $$ declare t text; begin
 foreach t in array array['education_reserve_funds','education_reserve_entries'] loop
  execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy read_family on public.%I for select to authenticated using (public.has_active_role(''viewer''))',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.education_entry_json(e public.education_reserve_entries) returns jsonb language sql immutable as $$
 select jsonb_build_object('id',e.id,'fundId',e.fund_id,'entryDate',e.entry_date,'entryType',e.entry_type,
 'currency',e.currency,'amount',e.amount::text,'expenseCategory',e.expense_category,'relatedExpenseId',e.related_expense_id,
 'targetCurrency',e.target_currency,'targetAmount',e.target_amount::text,'notes',e.notes,'version',e.version,'legacyTransactionId',e.legacy_transaction_id);
$$;

create function public.read_education_reserve() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('fund',jsonb_build_object('id',f.id,'name',f.name,'legacyAccountId',f.legacy_account_id,'cutoverAt',f.cutover_at),
 'entries',coalesce((select jsonb_agg(public.education_entry_json(e) order by e.entry_date desc,e.id desc) from education_reserve_entries e where e.fund_id=f.id),'[]'::jsonb))
 from education_reserve_funds f where singleton_key='education';
$$;

-- Serializing writes on the fund makes refund integrity and optimistic edits atomic.
create function public.mutate_education_reserve_entry(operation text,entry_id uuid,actor_id uuid,expected_version integer,entry jsonb)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare f education_reserve_funds; old_entry education_reserve_entries; saved education_reserve_entries;
begin
 select * into strict f from education_reserve_funds where singleton_key='education' for update;
 if f.cutover_at is null then raise exception 'Education migration is not activated' using errcode='23514'; end if;
 if operation not in ('create','update','delete') then raise exception 'Invalid operation' using errcode='23514'; end if;
 if operation<>'create' then
  select * into old_entry from education_reserve_entries where id=entry_id and fund_id=f.id;
  if not found then raise exception 'Not found' using errcode='P0002'; end if;
  if expected_version is null or old_entry.version<>expected_version then raise exception 'Stale entry' using errcode='40001'; end if;
 end if;
 if operation='delete' then delete from education_reserve_entries where id=entry_id;
 elsif operation='create' then
  insert into education_reserve_entries(id,fund_id,entry_date,entry_type,currency,amount,expense_category,related_expense_id,target_currency,target_amount,notes,created_by_user_id,updated_by_user_id)
  values(entry_id,f.id,(entry->>'entryDate')::date,entry->>'entryType',entry->>'currency',(entry->>'amount')::numeric,entry->>'expenseCategory',
   (entry->>'relatedExpenseId')::uuid,entry->>'targetCurrency',(entry->>'targetAmount')::numeric,entry->>'notes',actor_id,actor_id) returning * into saved;
 else
  update education_reserve_entries set entry_date=(entry->>'entryDate')::date,entry_type=entry->>'entryType',currency=entry->>'currency',amount=(entry->>'amount')::numeric,
  expense_category=entry->>'expenseCategory',related_expense_id=(entry->>'relatedExpenseId')::uuid,target_currency=entry->>'targetCurrency',target_amount=(entry->>'targetAmount')::numeric,
  notes=entry->>'notes',version=version+1,updated_by_user_id=actor_id where id=entry_id returning * into saved;
 end if;
 if exists(select 1 from education_reserve_entries r left join education_reserve_entries e on e.id=r.related_expense_id
  where r.related_expense_id is not null and (e.id is null or e.entry_type<>'expense' or r.fund_id<>e.fund_id or r.currency<>e.currency or r.expense_category<>e.expense_category or r.entry_date<e.entry_date))
  or exists(select 1 from education_reserve_entries e join education_reserve_entries r on r.related_expense_id=e.id group by e.id,e.amount having sum(r.amount)>e.amount)
 then raise exception 'Refund relationship invalid' using errcode='23514'; end if;
 return case when operation='delete' then null else education_entry_json(saved) end;
end $$;

-- Defense in depth for the old account APIs and linked transaction paths.
create function public.guard_education_legacy_writes() returns trigger language plpgsql set search_path=public as $$
declare active boolean; aid uuid;
begin
 select exists(select 1 from education_reserve_funds where cutover_at is not null) into active;
 if not active then return case when tg_op='DELETE' then old else new end; end if;
 if tg_table_name='investment_accounts' then
  if (tg_op<>'INSERT' and old.purpose='education') or (tg_op<>'DELETE' and new.purpose='education') then
   raise exception 'Use education reserve' using errcode='23514';
  end if;
 else
  if tg_op<>'INSERT' and exists(select 1 from investment_accounts where id=old.account_id and purpose='education') then
   raise exception 'Legacy education is read-only' using errcode='23514'; end if;
  if tg_op<>'DELETE' and exists(select 1 from investment_accounts where id=new.account_id and purpose='education') then
   raise exception 'Use education reserve' using errcode='23514'; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger guard_education_legacy before insert or update or delete on public.investment_accounts for each row execute function public.guard_education_legacy_writes();
create trigger guard_education_legacy before insert or update or delete on public.transactions for each row execute function public.guard_education_legacy_writes();

create function public.query_family_cashflows(filters jsonb) returns jsonb language sql stable security definer set search_path=public as $$
 with activity as (
  select 'daily_expense'::text domain,r.id source_id,r.transaction_date date,r.classification kind,r.tag category,a.default_currency currency,r.amount,r.notes,r.description
  from statement_rows r join spending_accounts a on a.id=r.account_id
  union all
  select 'education',e.id,e.entry_date,e.entry_type,e.expense_category,e.currency,
   case when e.entry_type in ('expense','withdrawal','exchange') then -e.amount else e.amount end,e.notes,''
  from education_reserve_entries e
 ), selected as (
  select * from activity where (coalesce(filters->>'domain','all')='all' or domain=filters->>'domain')
  and (filters->>'from' is null or date>=(filters->>'from')::date) and (filters->>'to' is null or date<=(filters->>'to')::date)
  and (filters->>'currency' is null or currency=filters->>'currency') and (filters->>'category' is null or (domain='education' and category=filters->>'category'))
 ), paged as (select * from selected order by date desc,domain,source_id desc limit coalesce((filters->>'limit')::integer,50) offset coalesce((filters->>'offset')::integer,0)),
 totals as (
  select domain,currency,count(*) count,
   coalesce(sum(amount) filter(where domain='daily_expense' and kind='income'),0) income,
   coalesce(sum(-amount) filter(where (domain='daily_expense' and kind='spending') or (domain='education' and kind='expense')),0) expenses,
   coalesce(sum(amount) filter(where kind='refund'),0) refunds
  from selected group by domain,currency
 ) select jsonb_build_object(
 'rows',coalesce((select jsonb_agg(jsonb_build_object('domain',domain,'sourceId',source_id,'date',date,'kind',kind,'category',category,'currency',currency,'amount',amount::text,'notes',coalesce(notes,nullif(description,''))) order by date desc,domain,source_id desc) from paged),'[]'::jsonb),
 'pagination',jsonb_build_object('limit',coalesce((filters->>'limit')::integer,50),'offset',coalesce((filters->>'offset')::integer,0),'total',(select count(*) from selected),'hasMore',(select count(*) from selected)>coalesce((filters->>'offset')::integer,0)+coalesce((filters->>'limit')::integer,50)),
 'totals',coalesce((select jsonb_agg(jsonb_build_object('domain',domain,'currency',currency,'income',income::text,'expenses',expenses::text,'refunds',refunds::text,'netSpending',(expenses-refunds)::text,'count',count) order by domain,currency) from totals),'[]'::jsonb));
$$;

revoke all on function public.education_entry_json(public.education_reserve_entries),public.read_education_reserve(),public.mutate_education_reserve_entry(text,uuid,uuid,integer,jsonb),public.query_family_cashflows(jsonb) from public,anon,authenticated;
grant execute on function public.education_entry_json(public.education_reserve_entries),public.read_education_reserve(),public.mutate_education_reserve_entry(text,uuid,uuid,integer,jsonb),public.query_family_cashflows(jsonb) to service_role;

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
    'education_reserve_funds', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.education_reserve_funds t), '[]'::jsonb),
    'education_reserve_entries', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('amount',t.amount::text,'target_amount',t.target_amount::text) order by t.id) from public.education_reserve_entries t), '[]'::jsonb),
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

notify pgrst,'reload schema';
commit;
