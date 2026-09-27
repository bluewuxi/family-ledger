begin;
create or replace function public.guard_spending_account() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.default_currency,new.source_format,new.identity_suffix) is distinct from (old.default_currency,old.source_format,old.identity_suffix) then
  if exists(select 1 from statement_rows where account_id=old.id)
    or exists(select 1 from account_statements where account_id=old.id and status in ('committed','undone','document')) then
   raise exception 'Account format/currency/identity is already in use' using errcode='23514';
  end if;
  -- Expire the batch as well as its token so an in-flight old-format preview cannot revive it.
  update account_statements set status='draft',preview=null,preview_token=null,decisions=null,
   encoding=null,parser_version=null,rejected_count=0,expires_at=least(expires_at,now()),updated_at=now()
   where account_id=old.id and status in ('draft','preview');
 end if;
 return new;
end $$;
commit;
