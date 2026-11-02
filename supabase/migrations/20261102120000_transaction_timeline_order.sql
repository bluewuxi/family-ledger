-- Persist the API's planned timestamp so same-day order cannot drift at commit.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.commit_transaction_write(text,uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure) into definition;
  if position('coalesce(parent.created_at, now())' in definition) = 0 then
    if position('parent.settlement_amount, parent.notes, actor_id, actor_id);' in definition) = 0 then
      raise exception 'Transaction writer definition does not match the expected timestamp upgrade';
    end if;
    definition := replace(definition,
      'linked_transaction_id, settlement_currency, settlement_amount, notes, created_by_user_id, updated_by_user_id)',
      'linked_transaction_id, settlement_currency, settlement_amount, notes, created_by_user_id, updated_by_user_id, created_at)');
    definition := replace(definition,
      'parent.settlement_amount, parent.notes, actor_id, actor_id);',
      'parent.settlement_amount, parent.notes, actor_id, actor_id, coalesce(parent.created_at, now()));');
    -- The cash insert has the same column suffix, and must receive its own timestamp.
    definition := replace(definition,
      'cash.settlement_currency, cash.settlement_amount, cash.notes, actor_id, actor_id)',
      'cash.settlement_currency, cash.settlement_amount, cash.notes, actor_id, actor_id, now())');
    execute definition;
  end if;
end;
$$;
