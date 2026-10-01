begin;
lock table public.spending_accounts, public.account_statements, public.statement_rows in access exclusive mode;
alter table public.statement_rows
 add column account_number_last4 text check(account_number_last4 ~ '^[0-9]{4}$'),
 add column counterparty_name text check(length(counterparty_name) <= 1000),
 add column counterparty_account_last4 text check(counterparty_account_last4 ~ '^[0-9]{4}$');
alter table public.account_statements
 add column total_count integer check(total_count >= 0),
 add column cancelled_at timestamptz;
alter table public.account_statements drop constraint account_statements_status_check;
alter table public.account_statements add constraint account_statements_status_check check(status in ('draft','preview','committed','undone','document','cancelled'));
create function public.spending_account_last4(value text) returns text language sql immutable set search_path=public as $$
 select substring(regexp_replace(btrim(value),'[[:space:]-]','','g') from '([0-9]{4})$');
$$;
create function public.sanitize_spending_metadata(value jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb:=coalesce(value,'{}'); k text;
begin
 foreach k in array array['信用卡卡号','card_number','对方账号','This Party Account','Other Party Account'] loop
  if result ? k then result:=jsonb_set(result,array[k],to_jsonb(coalesce(spending_account_last4(result->>k),''))); end if;
 end loop;
 return result;
end $$;
-- Preserve source fingerprints, edited flags and historical audit timestamps during backfill.
alter table public.statement_rows disable trigger guard_spending_row;
alter table public.statement_rows disable trigger set_updated_at;
update statement_rows r set
 counterparty_name=case when a.source_format='ccb_debit' then nullif(btrim(r.source_metadata->>'对方户名'),'') end,
 account_number_last4=case a.source_format
  when 'ccb_credit' then coalesce(spending_account_last4(r.source_metadata->>'card_number'),spending_account_last4(r.source_metadata->>'信用卡卡号'))
  when 'bnz' then spending_account_last4(r.source_metadata->>'This Party Account')
  when 'ccb_debit' then a.identity_suffix end,
 counterparty_account_last4=case a.source_format when 'ccb_debit' then spending_account_last4(r.source_metadata->>'对方账号') when 'bnz' then spending_account_last4(r.source_metadata->>'Other Party Account') end,
 source_metadata=sanitize_spending_metadata(r.source_metadata)
 from spending_accounts a where a.id=r.account_id;
alter table public.statement_rows enable trigger guard_spending_row;
alter table public.statement_rows enable trigger set_updated_at;
update account_statements s set total_count=case when preview is not null then coalesce(jsonb_array_length(preview->'rows'),0)+coalesce(jsonb_array_length(preview->'errors'),0) when status in ('committed','undone') then imported_count+skipped_count+rejected_count end;
update account_statements s set preview=jsonb_set(preview,'{rows}',coalesce((select jsonb_agg(r || jsonb_build_object(
 'counterparty_name',case when a.source_format='ccb_debit' then nullif(btrim(r->'source_metadata'->>'对方户名'),'') end,
 'account_number_last4',case a.source_format when 'ccb_credit' then coalesce(spending_account_last4(r->'source_metadata'->>'card_number'),spending_account_last4(r->'source_metadata'->>'信用卡卡号')) when 'bnz' then spending_account_last4(r->'source_metadata'->>'This Party Account') when 'ccb_debit' then a.identity_suffix end,
 'counterparty_account_last4',case a.source_format when 'ccb_debit' then spending_account_last4(r->'source_metadata'->>'对方账号') when 'bnz' then spending_account_last4(r->'source_metadata'->>'Other Party Account') end,
 'source_metadata',sanitize_spending_metadata(r->'source_metadata')) order by ord) from jsonb_array_elements(s.preview->'rows') with ordinality x(r,ord)),'[]'))
 from spending_accounts a where a.id=s.account_id and s.preview is not null;
-- Old approvals must never confirm a preview generated before the privacy migration.
update account_statements set preview_token=null,decisions=null where status in ('draft','preview');
create index statement_rows_account_last4_idx on statement_rows(account_id,account_number_last4);
create index statement_rows_counterparty_last4_idx on statement_rows(account_id,counterparty_account_last4);
create or replace function public.guard_spending_row() returns trigger language plpgsql set search_path=public as $$
declare aid uuid;
begin
 aid := case when tg_op='DELETE' then old.account_id else new.account_id end;
 perform 1 from spending_accounts where id=aid for update;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' then
  if (new.account_id,new.statement_id,new.row_number,new.source_metadata,new.fingerprint,new.account_number_last4,new.counterparty_account_last4,new.counterparty_name) is distinct from (old.account_id,old.statement_id,old.row_number,old.source_metadata,old.fingerprint,old.account_number_last4,old.counterparty_account_last4,old.counterparty_name) then
   raise exception 'Cannot change source identity' using errcode='23514'; end if;
  new.edited := true;
 end if;
 if new.statement_id is not null and not exists(select 1 from account_statements where id=new.statement_id and account_id=new.account_id and status='committed') then
  raise exception 'Import batch mismatch' using errcode='23514'; end if;
 return new;
end $$;
create or replace view public.spending_row_details with(security_invoker=true) as
 select r.id,r.account_id,r.statement_id,r.row_number,r.transaction_date,r.description,r.amount::text,r.classification,r.tag,r.notes,r.source_metadata,r.fingerprint,r.updated_at,
 a.name account_name,a.default_currency currency,r.account_number_last4,r.counterparty_account_last4,r.counterparty_name from statement_rows r join spending_accounts a on a.id=r.account_id;
drop view public.spending_statement_details;
create view public.spending_statement_details with(security_invoker=true) as
 select s.*,a.name account_name,(select count(*) from statement_rows r where r.statement_id=s.id)::int row_count,
 (select count(*) from statement_rows r where r.statement_id=s.id and r.edited)::int edited_count
 from account_statements s join spending_accounts a on a.id=s.account_id;
grant select on public.spending_statement_details to service_role;
create or replace function public.set_spending_preview(batch_id uuid, payload jsonb, actor_id uuid) returns uuid language plpgsql set search_path=public as $$
declare b account_statements; token uuid:=gen_random_uuid();
begin
 select * into b from account_statements where id=batch_id;
 perform 1 from spending_accounts where id=b.account_id and is_active for update;
 if not found then raise exception 'Account inactive' using errcode='23514'; end if;
 select * into b from account_statements where id=batch_id for update;
 if b.status not in ('draft','preview') or b.expires_at<now() then raise exception 'Preview expired or batch closed' using errcode='23514'; end if;
 if payload->'preview'->>'parser_version' is distinct from 'bank-csv-2' then raise exception 'Refresh preview with current parser' using errcode='23514'; end if;
 update account_statements set total_count=jsonb_array_length(payload->'preview'->'rows')+jsonb_array_length(payload->'preview'->'errors'),preview=payload->'preview',preview_token=token,encoding=payload->'preview'->>'encoding',parser_version=payload->'preview'->>'parser_version',rejected_count=jsonb_array_length(payload->'preview'->'errors'),
 csv_file_key=payload->>'key',csv_file_version=payload->>'version',csv_file_name=payload->>'filename',csv_sha256=payload->>'sha256',status='preview',updated_by_user_id=actor_id where id=batch_id;
 return token;
end $$;
create or replace function public.commit_spending_import(batch_id uuid, token uuid, choices jsonb, actor_id uuid, permanent_key text, permanent_version text) returns uuid language plpgsql set search_path=public as $$
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
  insert into statement_rows(account_id,statement_id,row_number,transaction_date,description,amount,classification,tag,source_metadata,fingerprint,account_number_last4,counterparty_account_last4,counterparty_name,created_by_user_id,updated_by_user_id)
  values(b.account_id,b.id,(r->>'row_number')::int,(r->>'transaction_date')::date,r->>'description',(r->>'amount')::numeric,d->>'classification',nullif(btrim(d->>'tag'),''),r->'source_metadata',r->>'fingerprint',r->>'account_number_last4',r->>'counterparty_account_last4',r->>'counterparty_name',actor_id,actor_id);
  imported:=imported+1;
 end loop;
 update account_statements set imported_count=imported,skipped_count=skipped,rejected_count=0,
 date_from=(select min(transaction_date) from statement_rows where statement_id=batch_id),date_to=(select max(transaction_date) from statement_rows where statement_id=batch_id) where id=batch_id;
 return batch_id;
end $$;
create or replace function public.query_spending_rows(filters jsonb) returns jsonb language sql stable security invoker set search_path=public as $$
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
 (filters->>'accountNumberLast4' is null or r.account_number_last4=filters->>'accountNumberLast4') and
 (filters->>'counterpartyAccountLast4' is null or r.counterparty_account_last4=filters->>'counterpartyAccountLast4') and
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
create or replace function public.spending_filter_options(account_id_filter uuid default null) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('accountNumberLast4',coalesce(jsonb_agg(distinct account_number_last4 order by account_number_last4) filter(where account_number_last4 is not null),'[]'), 'counterpartyAccountLast4',coalesce(jsonb_agg(distinct counterparty_account_last4 order by counterparty_account_last4) filter(where counterparty_account_last4 is not null),'[]'), 'tags',coalesce(jsonb_agg(distinct tag order by tag) filter(where tag is not null),'[]')) from spending_row_details where account_id_filter is null or account_id=account_id_filter;
$$;
create or replace function public.guard_spending_account() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.default_currency,new.source_format,new.identity_suffix) is distinct from (old.default_currency,old.source_format,old.identity_suffix) then
  if exists(select 1 from statement_rows where account_id=old.id)
    or exists(select 1 from account_statements where account_id=old.id and status in ('committed','undone','document')) then
   raise exception 'Account format/currency/identity is already in use' using errcode='23514';
  end if;
  -- Expire the batch as well as its token so an in-flight old-format preview cannot revive it.
  update account_statements set status='draft',preview=null,preview_token=null,decisions=null,
   encoding=null,parser_version=null,rejected_count=0,total_count=null,expires_at=least(expires_at,now()),updated_at=now()
   where account_id=old.id and status in ('draft','preview');
 end if;
 return new;
end $$;


create function public.cancel_spending_import(batch_id uuid, actor_id uuid) returns uuid language plpgsql set search_path=public as $$
declare b account_statements;
begin
 select * into b from account_statements where id=batch_id;
 if not found then raise exception 'Batch missing' using errcode='23514'; end if;
 perform 1 from spending_accounts where id=b.account_id for update;
 select * into b from account_statements where id=batch_id for update;
 if b.status='cancelled' then return b.id; end if;
 if b.status not in ('draft','preview') then raise exception 'Only pending imports can be cancelled' using errcode='23514'; end if;
 update account_statements set status='cancelled',cancelled_at=now(),preview_token=null,decisions=null,updated_by_user_id=actor_id where id=batch_id;
 return batch_id;
end $$;
-- Row-level update serialization also blocks a late attachment completion after cancellation.
create function public.guard_cancelled_spending_import() returns trigger language plpgsql set search_path=public as $$
begin
 if old.status='cancelled' then raise exception 'Cancelled import is read only' using errcode='23514'; end if;
 return new;
end $$;
create trigger guard_cancelled_spending_import before update on public.account_statements for each row execute function public.guard_cancelled_spending_import();
revoke all on function public.cancel_spending_import(uuid,uuid),public.spending_account_last4(text),public.sanitize_spending_metadata(jsonb),public.guard_cancelled_spending_import() from public,anon,authenticated;
grant execute on function public.cancel_spending_import(uuid,uuid),public.spending_account_last4(text),public.sanitize_spending_metadata(jsonb),public.guard_cancelled_spending_import() to service_role;
notify pgrst,'reload schema';
commit;
