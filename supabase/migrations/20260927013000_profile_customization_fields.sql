alter table public.profiles
  add column if not exists accent_color text not null default '#3b82f6',
  add column if not exists profile_theme text not null default 'clean',
  add column if not exists pinned_post_id bigint references public.posts(id) on delete set null,
  add column if not exists custom_title text,
  add column if not exists showcased_badges text[] not null default '{}',
  add column if not exists profile_layout text not null default 'classic';

alter table public.profiles drop constraint if exists profiles_accent_color_check;
alter table public.profiles add constraint profiles_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.profiles drop constraint if exists profiles_profile_theme_check;
alter table public.profiles add constraint profiles_profile_theme_check check (profile_theme in ('clean','neon','retro','clown','fire','darkblue'));

alter table public.profiles drop constraint if exists profiles_profile_layout_check;
alter table public.profiles add constraint profiles_profile_layout_check check (profile_layout in ('classic','compact','cards','banner'));

alter table public.profiles drop constraint if exists profiles_custom_title_check;
alter table public.profiles add constraint profiles_custom_title_check check (custom_title is null or char_length(custom_title) <= 40);

alter table public.profiles drop constraint if exists profiles_showcased_badges_check;
alter table public.profiles add constraint profiles_showcased_badges_check check (coalesce(array_length(showcased_badges,1),0) <= 3);
