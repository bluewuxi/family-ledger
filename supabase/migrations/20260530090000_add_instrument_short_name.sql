alter table public.instruments
  add column if not exists short_name text;

update public.instruments
set short_name = case
  when symbol in ('AMD', 'QQQM', 'VOO', 'VGT', 'SMH') then symbol
  when symbol = '01810' then '小米'
  when symbol = '00700' then '腾讯'
  when symbol = '161128' then '标普信息科技'
  when symbol = '159501' then '纳指100'
  when symbol = '513500' then '标普500'
  when symbol = 'FS_NASDAQ_100' then 'FS 纳指100'
  when symbol = 'FS_TOTAL_WORLD' then 'FS 全球'
  when symbol = 'FS_US_500' then 'FS 标普500'
  when symbol like 'CASH_%' then replace(symbol, 'CASH_', '') || '现金'
  when nullif(btrim(symbol), '') is not null then btrim(symbol)
  else left(btrim(name), 32)
end
where short_name is null or btrim(short_name) = '';

update public.instruments
set short_name = left(btrim(short_name), 32);

alter table public.instruments
  alter column short_name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'instruments_short_name_not_blank_check'
      and conrelid = 'public.instruments'::regclass
  ) then
    alter table public.instruments
      add constraint instruments_short_name_not_blank_check check (btrim(short_name) <> '') not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'instruments_short_name_length_check'
      and conrelid = 'public.instruments'::regclass
  ) then
    alter table public.instruments
      add constraint instruments_short_name_length_check check (length(short_name) <= 32) not valid;
  end if;
end $$;

alter table public.instruments
  validate constraint instruments_short_name_not_blank_check;

alter table public.instruments
  validate constraint instruments_short_name_length_check;
