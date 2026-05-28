alter table public.profiles
  add column if not exists ui_theme text not null default 'light';

alter table public.profiles
  drop constraint if exists profiles_ui_theme_check;

alter table public.profiles
  add constraint profiles_ui_theme_check
  check (ui_theme in ('light', 'dark'));
