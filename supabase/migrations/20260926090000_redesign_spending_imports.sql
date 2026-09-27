-- Empty-table redesign only. Stop instead of discarding unexpectedly entered data.
begin;
set local lock_timeout='10s';
lock table public.spending_accounts,public.account_statements,public.statement_rows in access exclusive mode;
do $$ begin
  if exists(select 1 from public.spending_accounts) or exists(select 1 from public.account_statements) or exists(select 1 from public.statement_rows) then
    raise exception 'Spending redesign requires empty spending tables';
  end if;
end $$;
drop view public.spending_row_details;
drop view public.spending_statement_details;
drop function public.query_spending_rows(jsonb);
drop function public.spending_filter_options(uuid);
drop function public.delete_spending_row(uuid,uuid);
drop table public.statement_rows;
drop table public.account_statements;
drop table public.spending_accounts;
drop function public.guard_spending_statement();
drop function public.guard_spending_row();

create table public.spending_accounts (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
 source_format text not null check(source_format in ('ccb_debit','ccb_credit','bnz')),
 default_currency text not null check(default_currency in ('CNY','NZD','USD','JPY','HKD','GBP','EUR','AUD')),
 identity_suffix text check(identity_suffix ~ '^[0-9]{4}$'), is_active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_user_id uuid references auth.users(id),updated_by_user_id uuid references auth.users(id)
);
create table public.account_statements (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.spending_accounts(id),
 status text not null default 'draft' check(status in ('draft','preview','committed','undone','document')),
 encoding text check(encoding in ('utf-8','gb18030','utf-16le','utf-16be')), parser_version text,
 csv_file_key text,csv_file_version text,csv_file_name text,csv_sha256 text check(csv_sha256 ~ '^[0-9a-f]{64}$'),
 source_file_key text,source_file_version text,source_file_name text,source_file_size integer,file_sha256 text,
 preview jsonb,preview_token uuid,decisions jsonb,
 imported_count integer not null default 0,skipped_count integer not null default 0,rejected_count integer not null default 0,
 date_from date,date_to date,expires_at timestamptz not null default now()+interval '1 day',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_user_id uuid references auth.users(id),updated_by_user_id uuid references auth.users(id),
 check((source_file_key is null and source_file_version is null and source_file_name is null and source_file_size is null and file_sha256 is null)
 or(source_file_key is not null and source_file_version is not null and source_file_name is not null and source_file_size between 5 and 10485760 and file_sha256 ~ '^[0-9a-f]{64}$')),
 check(status not in ('preview','committed') or (csv_file_key is not null and csv_file_version is not null and csv_sha256 is not null))
);
create unique index spending_committed_file on public.account_statements(account_id,csv_sha256) where status='committed';
create index on public.account_statements(account_id,created_at desc);
create table public.statement_rows (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.spending_accounts(id),
 statement_id uuid references public.account_statements(id),row_number integer,
 transaction_date date not null,description text not null check(length(btrim(description)) between 1 and 1000),
 amount numeric(20,6) not null,
 classification text not null default 'review' check(classification in ('income','spending','refund','excluded','review')),
 tag text check(tag is null or length(btrim(tag)) between 1 and 80),notes text check(length(notes)<=4000),
 source_metadata jsonb not null default '{}', fingerprint text, edited boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_user_id uuid references auth.users(id),updated_by_user_id uuid references auth.users(id),
 unique(statement_id,row_number),
 check((statement_id is null and row_number is null) or (statement_id is not null and row_number>0)),
 check((classification='spending' and amount<0) or (classification in ('income','refund') and amount>0) or classification in ('excluded','review'))
);
create index on public.statement_rows(transaction_date desc,id desc);
create index on public.statement_rows(account_id,fingerprint);
create index on public.statement_rows(tag);

create function public.guard_spending_account() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.default_currency,new.source_format,new.identity_suffix) is distinct from (old.default_currency,old.source_format,old.identity_suffix)
 and (exists(select 1 from statement_rows where account_id=old.id) or exists(select 1 from account_statements where account_id=old.id)) then
 raise exception 'Account format/currency/identity is already in use' using errcode='23514'; end if;
 return new;
end $$;
create trigger guard_spending_account before update on public.spending_accounts for each row execute function public.guard_spending_account();
create function public.guard_spending_row() returns trigger language plpgsql set search_path=public as $$
declare aid uuid;
begin
 aid := case when tg_op='DELETE' then old.account_id else new.account_id end;
 perform 1 from spending_accounts where id=aid for update;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' then
  if (new.account_id,new.statement_id,new.row_number,new.source_metadata,new.fingerprint) is distinct from (old.account_id,old.statement_id,old.row_number,old.source_metadata,old.fingerprint) then
   raise exception 'Cannot change source identity' using errcode='23514'; end if;
  new.edited := true;
 end if;
 if new.statement_id is not null and not exists(select 1 from account_statements where id=new.statement_id and account_id=new.account_id and status='committed') then
  raise exception 'Import batch mismatch' using errcode='23514'; end if;
 return new;
end $$;
create trigger guard_spending_row before insert or update or delete on public.statement_rows for each row execute function public.guard_spending_row();

do $$ declare t text; begin
 foreach t in array array['spending_accounts','account_statements','statement_rows'] loop
  execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy read_family on public.%I for select to authenticated using (public.has_active_role(''viewer''))',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create view public.spending_row_details with(security_invoker=true) as
 select r.id,r.account_id,r.statement_id,r.row_number,r.transaction_date,r.description,r.amount::text,r.classification,r.tag,r.notes,r.source_metadata,r.fingerprint,r.updated_at,
 a.name account_name,a.default_currency currency from statement_rows r join spending_accounts a on a.id=r.account_id;
create view public.spending_statement_details with(security_invoker=true) as
 select s.*,a.name account_name,(select count(*) from statement_rows r where r.statement_id=s.id)::int row_count,
 (select count(*) from statement_rows r where r.statement_id=s.id and r.edited)::int edited_count
 from account_statements s join spending_accounts a on a.id=s.account_id;
grant select on public.spending_row_details,public.spending_statement_details to service_role;

create function public.set_spending_preview(batch_id uuid, payload jsonb, actor_id uuid) returns uuid language plpgsql set search_path=public as $$
declare b account_statements; token uuid:=gen_random_uuid();
begin
 select * into b from account_statements where id=batch_id;
 perform 1 from spending_accounts where id=b.account_id and is_active for update;
 if not found then raise exception 'Account inactive' using errcode='23514'; end if;
 select * into b from account_statements where id=batch_id for update;
 if b.status not in ('draft','preview') or b.expires_at<now() then raise exception 'Preview expired or batch closed' using errcode='23514'; end if;
 update account_statements set preview=payload->'preview',preview_token=token,encoding=payload->'preview'->>'encoding',parser_version=payload->'preview'->>'parser_version',rejected_count=jsonb_array_length(payload->'preview'->'errors'),
 csv_file_key=payload->>'key',csv_file_version=payload->>'version',csv_file_name=payload->>'filename',csv_sha256=payload->>'sha256',status='preview',updated_by_user_id=actor_id where id=batch_id;
 return token;
end $$;
create function public.commit_spending_import(batch_id uuid, token uuid, choices jsonb, actor_id uuid, permanent_key text, permanent_version text) returns uuid language plpgsql set search_path=public as $$
declare b account_statements; r jsonb; d jsonb; decisions_by_row jsonb; existing_count int; imported int:=0; skipped int:=0;
begin
 select * into b from account_statements where id=batch_id;
 perform 1 from spending_accounts where id=b.account_id and is_active for update;
 if not found then raise exception 'Account inactive' using errcode='23514'; end if;
 select * into b from account_statements where id=batch_id for update;
 if b.preview_token is distinct from token then raise exception 'Preview changed; reload it' using errcode='23514'; end if;
 if b.status='committed' then
  if b.decisions is distinct from choices then raise exception 'Retry decisions differ' using errcode='23514'; end if;
  return b.id;
 end if;
 if b.status<>'preview' or b.expires_at<now() then raise exception 'Preview expired or batch closed' using errcode='23514'; end if;
 if jsonb_array_length(b.preview->'errors')>0 then raise exception 'Invalid CSV rows must be corrected before importing' using errcode='23514'; end if;
 if jsonb_array_length(choices)<>jsonb_array_length(b.preview->'rows') or (select count(distinct (x->>'row_number')::int) from jsonb_array_elements(choices) x)<>jsonb_array_length(choices) then
  raise exception 'Each preview row needs one decision' using errcode='23514'; end if;
 -- Validate all candidate counts before any inserts, preserving multiplicity within this file.
 select jsonb_object_agg(x->>'row_number',x) into decisions_by_row from jsonb_array_elements(choices) x;
 for r in select * from jsonb_array_elements(b.preview->'rows') loop
  d := decisions_by_row->(r->>'row_number');
  if d is null then raise exception 'Missing decision' using errcode='23514'; end if;
  if not (d->>'skip')::boolean then
   select count(*) into existing_count from statement_rows where account_id=b.account_id and fingerprint=r->>'fingerprint';
   if existing_count<>(r->>'duplicate_count')::int then raise exception 'Transactions changed; preview again' using errcode='23514'; end if;
   if existing_count>0 and not (d->>'allow_duplicate')::boolean then raise exception 'Possible duplicate needs explicit approval' using errcode='23514'; end if;
  end if;
 end loop;
 update account_statements set status='committed',decisions=choices,csv_file_key=permanent_key,csv_file_version=permanent_version,updated_by_user_id=actor_id where id=batch_id;
 for r in select * from jsonb_array_elements(b.preview->'rows') loop
  d := decisions_by_row->(r->>'row_number');
  if (d->>'skip')::boolean then skipped:=skipped+1; continue; end if;
  insert into statement_rows(account_id,statement_id,row_number,transaction_date,description,amount,classification,tag,source_metadata,fingerprint,created_by_user_id,updated_by_user_id)
  values(b.account_id,b.id,(r->>'row_number')::int,(r->>'transaction_date')::date,r->>'description',(r->>'amount')::numeric,d->>'classification',nullif(btrim(d->>'tag'),''),r->'source_metadata',r->>'fingerprint',actor_id,actor_id);
  imported:=imported+1;
 end loop;
 update account_statements set imported_count=imported,skipped_count=skipped,rejected_count=0,
 date_from=(select min(transaction_date) from statement_rows where statement_id=batch_id),date_to=(select max(transaction_date) from statement_rows where statement_id=batch_id) where id=batch_id;
 return batch_id;
end $$;
create function public.undo_spending_import(batch_id uuid, actor_id uuid, confirm_edited boolean) returns integer language plpgsql set search_path=public as $$
declare b account_statements; n int;
begin
 select * into b from account_statements where id=batch_id;
 perform 1 from spending_accounts where id=b.account_id for update;
 select * into b from account_statements where id=batch_id for update;
 if b.status='undone' then return 0; end if;
 if b.status<>'committed' then raise exception 'Only committed imports can be undone' using errcode='23514'; end if;
 if not confirm_edited and exists(select 1 from statement_rows where statement_id=batch_id and edited) then raise exception 'Edited rows need confirmation' using errcode='23514'; end if;
 delete from statement_rows where statement_id=batch_id; get diagnostics n=row_count;
 update account_statements set status='undone',updated_by_user_id=actor_id where id=batch_id;
 return n;
end $$;
create function public.bulk_classify_spending(ids uuid[], changes jsonb, actor_id uuid) returns integer language plpgsql set search_path=public as $$
declare n int;
begin
 -- Same lock order as imports/undo; avoid locking rows before their accounts.
 perform 1 from spending_accounts where id in(select account_id from statement_rows where id=any(ids)) order by id for update;
 if (select count(*) from statement_rows where id=any(ids))<>cardinality(ids) then raise exception 'Selection changed' using errcode='23514'; end if;
 update statement_rows set classification=coalesce(changes->>'classification',classification),tag=case when changes?'tag' then changes->>'tag' else tag end,updated_by_user_id=actor_id where id=any(ids);
 get diagnostics n=row_count; return n;
end $$;

create function public.mutate_spending_row(target_id uuid, row_values jsonb, actor_id uuid, remove boolean) returns uuid language plpgsql set search_path=public as $$
declare aid uuid; rid uuid;
begin
 if target_id is null then aid:=(row_values->>'account_id')::uuid;
 else select account_id into aid from statement_rows where id=target_id; end if;
 perform 1 from spending_accounts where id=aid and is_active for update;
 if not found then raise exception 'Account missing/inactive' using errcode='23514'; end if;
 if remove then delete from statement_rows where id=target_id returning id into rid; return rid; end if;
 if target_id is null then
  insert into statement_rows(account_id,transaction_date,description,amount,classification,tag,notes,created_by_user_id,updated_by_user_id)
  values(aid,(row_values->>'transaction_date')::date,row_values->>'description',(row_values->>'amount')::numeric,row_values->>'classification',row_values->>'tag',row_values->>'notes',actor_id,actor_id) returning id into rid;
 else
  update statement_rows set transaction_date=(row_values->>'transaction_date')::date,description=row_values->>'description',amount=(row_values->>'amount')::numeric,classification=row_values->>'classification',tag=row_values->>'tag',notes=row_values->>'notes',updated_by_user_id=actor_id where id=target_id returning id into rid;
 end if;
 if rid is null then raise exception 'Row missing' using errcode='23514'; end if;
 return rid;
end $$;
create function public.spending_duplicate_counts(aid uuid, fingerprints text[]) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_object_agg(fingerprint,n),'{}') from(select fingerprint,count(*) n from statement_rows where account_id=aid and fingerprint=any(fingerprints) group by fingerprint) counts;
$$;
create function public.query_spending_rows(filters jsonb) returns jsonb language sql stable security invoker set search_path=public as $$
with matched as materialized (
 select * from spending_row_details r where
 (filters->>'from' is null or r.transaction_date >= (filters->>'from')::date) and
 (filters->>'to' is null or r.transaction_date <= (filters->>'to')::date) and
 (filters->>'accountId' is null or r.account_id=(filters->>'accountId')::uuid) and
 (filters->>'statementId' is null or r.statement_id=(filters->>'statementId')::uuid) and
 (filters->>'classification' is null or r.classification=filters->>'classification') and
 (filters->>'tag' is null or r.tag=filters->>'tag') and
 (coalesce(filters->>'untagged','false')<>'true' or r.tag is null) and
 (filters->>'currency' is null or r.currency=filters->>'currency') and
 (filters->>'q' is null or position(lower(filters->>'q') in lower(r.description))>0)
), grouped as (
 select currency,to_char(transaction_date,'YYYY-MM') month_label,tag,grouping(to_char(transaction_date,'YYYY-MM')) gm,grouping(tag) gt,
 count(*) count,count(*) filter(where classification='review') pending_count,
 coalesce(sum(amount::numeric) filter(where classification='income'),0)::text income,
 coalesce(-sum(amount::numeric) filter(where classification='spending'),0)::text gross_spending,
 coalesce(sum(amount::numeric) filter(where classification='refund'),0)::text refunds,
 coalesce(-sum(amount::numeric) filter(where classification in ('spending','refund')),0)::text net_spending
 from matched group by grouping sets((currency),(currency,to_char(transaction_date,'YYYY-MM')),(currency,tag))
), page as (select * from matched order by transaction_date desc,id desc limit (filters->>'limit')::int offset (filters->>'offset')::int)
select jsonb_build_object(
 'rows',coalesce((select jsonb_agg(to_jsonb(p) order by transaction_date desc,id desc) from page p),'[]'),
 'pagination',jsonb_build_object('limit',(filters->>'limit')::int,'offset',(filters->>'offset')::int,'total',(select count(*) from matched),'hasMore',(select count(*) from matched)>(filters->>'offset')::int+(filters->>'limit')::int),
 'totals',coalesce((select jsonb_agg(to_jsonb(g)-'gm'-'gt'-'tag'-'month_label' order by currency) from grouped g where gm=1 and gt=1),'[]'),
 'monthly',coalesce((select jsonb_agg((to_jsonb(g)-'gm'-'gt'-'tag'-'month_label')||jsonb_build_object('label',month_label) order by month_label,currency) from grouped g where gm=0),'[]'),
 'tags',coalesce((select jsonb_agg((to_jsonb(g)-'gm'-'gt'-'tag'-'month_label')||jsonb_build_object('label',tag) order by tag,currency) from grouped g where gt=0),'[]'));
$$;
create function public.spending_filter_options(account_id_filter uuid default null) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('tags',coalesce(jsonb_agg(distinct tag order by tag) filter(where tag is not null),'[]')) from spending_row_details where account_id_filter is null or account_id=account_id_filter;
$$;
do $$ declare f text; begin
 foreach f in array array['mutate_spending_row(uuid,jsonb,uuid,boolean)','spending_duplicate_counts(uuid,text[])','set_spending_preview(uuid,jsonb,uuid)','commit_spending_import(uuid,uuid,jsonb,uuid,text,text)','undo_spending_import(uuid,uuid,boolean)','bulk_classify_spending(uuid[],jsonb,uuid)','query_spending_rows(jsonb)','spending_filter_options(uuid)'] loop
  execute 'revoke all on function public.'||f||' from public,anon,authenticated';
  execute 'grant execute on function public.'||f||' to service_role';
 end loop;
end $$;

create or replace function public.export_ledger_backup(excluded_job_run_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'spending_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.spending_accounts t), '[]'::jsonb),
    'account_statements', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.account_statements t), '[]'::jsonb),
    'statement_rows', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('amount',t.amount::text) order by t.id) from public.statement_rows t), '[]'::jsonb),
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
notify pgrst, 'reload schema';
commit;
