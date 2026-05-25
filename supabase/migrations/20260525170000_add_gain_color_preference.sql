alter table public.profiles
  alter column preferred_currency set default 'CNY';

alter table public.profiles
  add column if not exists gain_color_scheme text not null default 'red_positive';

alter table public.profiles
  drop constraint if exists profiles_gain_color_scheme_check;

alter table public.profiles
  add constraint profiles_gain_color_scheme_check
  check (gain_color_scheme in ('red_positive', 'green_positive'));
