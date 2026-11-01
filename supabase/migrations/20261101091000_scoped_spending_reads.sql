begin;
drop function public.spending_filter_options(uuid);
create or replace function public.query_spending_rows(filters jsonb) returns jsonb language sql stable security invoker set search_path=public as $$
with matched as materialized (
 select * from spending_row_details r where
 (filters->'authorizedAccountIds' is null or filters->'authorizedAccountIds'='null'::jsonb or r.account_id in (select value::uuid from jsonb_array_elements_text(filters->'authorizedAccountIds'))) and
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
create or replace function public.spending_filter_options(account_id_filter uuid default null, authorized_account_ids uuid[] default null) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('accountNumberLast4',coalesce(jsonb_agg(distinct account_number_last4 order by account_number_last4) filter(where account_number_last4 is not null),'[]'), 'counterpartyAccountLast4',coalesce(jsonb_agg(distinct counterparty_account_last4 order by counterparty_account_last4) filter(where counterparty_account_last4 is not null),'[]'), 'tags',coalesce(jsonb_agg(distinct tag order by tag) filter(where tag is not null),'[]')) from spending_row_details where (account_id_filter is null or account_id=account_id_filter) and (authorized_account_ids is null or account_id=any(authorized_account_ids));
$$;

revoke all on function public.spending_filter_options(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.spending_filter_options(uuid,uuid[]) to service_role;
commit;
