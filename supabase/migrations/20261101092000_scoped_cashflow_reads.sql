begin;
create or replace function public.query_family_cashflows(filters jsonb) returns jsonb language sql stable security definer set search_path=public as $$
 with activity as (
  select 'daily_expense'::text domain,r.id source_id,r.transaction_date date,r.classification kind,r.tag category,a.default_currency currency,r.amount,r.notes,r.description
  from statement_rows r join spending_accounts a on a.id=r.account_id
  where (filters->'authorizedAccountIds' is null or filters->'authorizedAccountIds'='null'::jsonb or r.account_id in (select value::uuid from jsonb_array_elements_text(filters->'authorizedAccountIds')))
  union all
  select 'education',e.id,e.entry_date,e.entry_type,e.expense_category,e.currency,
   case when e.entry_type in ('expense','withdrawal','exchange') then -e.amount else e.amount end,e.notes,''
  from education_reserve_entries e where coalesce((filters->>'educationAllowed')::boolean,true)
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


commit;
