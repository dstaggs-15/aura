alter table public.profiles
  add column if not exists last_post_activity_at timestamptz not null default now(),
  add column if not exists post_inactivity_stage smallint not null default 0;

alter table public.profiles drop constraint if exists profiles_post_inactivity_stage_check;
alter table public.profiles add constraint profiles_post_inactivity_stage_check
  check (post_inactivity_stage between 0 and 3);

-- Start the new inactivity policy at deployment time so members are not
-- retroactively charged for inactivity from before this rule existed.
update public.profiles
set last_post_activity_at = now(),
    post_inactivity_stage = 0
where is_member = true;

create or replace function public.mark_post_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_post_activity_at = now(),
      post_inactivity_stage = 0
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_mark_post_activity on public.posts;
create trigger trg_mark_post_activity
after insert on public.posts
for each row execute function public.mark_post_activity();

create or replace function public.apply_post_inactivity_penalties()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_target_stage smallint;
  v_next_stage smallint;
  v_delta numeric;
  v_description text;
begin
  for r in
    select id, last_post_activity_at, post_inactivity_stage
    from public.profiles
    where is_member = true
    for update
  loop
    v_target_stage := case
      when now() - r.last_post_activity_at >= interval '10 days 12 hours' then 3
      when now() - r.last_post_activity_at >= interval '6 days' then 2
      when now() - r.last_post_activity_at >= interval '3 days' then 1
      else 0
    end;

    v_next_stage := r.post_inactivity_stage + 1;

    while v_next_stage <= v_target_stage loop
      v_delta := case v_next_stage
        when 1 then -10
        when 2 then -50
        when 3 then -150
      end;

      v_description := case v_next_stage
        when 1 then 'No Aura post for 3 days'
        when 2 then 'No Aura post for 6 days'
        when 3 then 'No Aura post for 10.5 days'
      end;

      perform public.apply_aura_delta_internal(
        r.id,
        v_delta,
        'post_inactivity',
        v_description
      );

      v_next_stage := v_next_stage + 1;
    end loop;

    if v_target_stage > r.post_inactivity_stage then
      update public.profiles
      set post_inactivity_stage = v_target_stage
      where id = r.id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.mark_post_activity() from public, anon, authenticated;
revoke execute on function public.apply_post_inactivity_penalties() from public, anon, authenticated;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'aura-post-inactivity'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'aura-post-inactivity',
  '17 * * * *',
  'select public.apply_post_inactivity_penalties();'
);
