alter table public.profiles
  alter column aura type numeric(12,1) using aura::numeric,
  alter column aura set default 0;
