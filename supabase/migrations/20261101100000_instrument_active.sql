begin;
alter table public.instruments add column active boolean not null default true;
comment on column public.instruments.active is 'Inactive instruments retain history and valuation but are excluded from new transaction choices and automatic price acquisition.';
commit;
