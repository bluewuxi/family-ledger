-- Preserve the former per-instrument top-20 candidates and provider selection.
create or replace function public.latest_price_candidates(price_keys jsonb)
returns setof public.instrument_prices
language sql stable security invoker set search_path = public
as $$
  select p.*
  from jsonb_to_recordset(price_keys) as k(instrument_id uuid, currency text)
  cross join lateral (
    select ip.* from public.instrument_prices ip
    where ip.instrument_id = k.instrument_id and ip.currency = k.currency
    order by ip.price_date desc, ip.id desc
    limit 20
  ) p;
$$;
revoke all on function public.latest_price_candidates(jsonb) from public, anon, authenticated;
grant execute on function public.latest_price_candidates(jsonb) to service_role;
