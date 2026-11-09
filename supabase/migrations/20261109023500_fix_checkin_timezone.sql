with latest_checkin as (
  select user_id,
         max((((created_at at time zone 'UTC') at time zone 'America/Chicago')::date)) as local_day
  from public.aura_ledger
  where type = 'checkin'
  group by user_id
)
update public.profiles p
set last_checkin = l.local_day
from latest_checkin l
where p.id = l.user_id;

do $$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  update public.profiles
  set last_penalty_date = case
    when last_checkin is null then last_penalty_date
    else greatest(
      last_checkin,
      least(coalesce(last_penalty_date, last_checkin), v_today)
    )
  end
  where is_member = true;
end $$;

create or replace function public.daily_checkin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last date;
  v_streak integer;
  v_balance numeric;
  v_reward numeric;
  v_new numeric;
  v_applied numeric;
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if v_uid is null or not public.is_aura_member() then
    raise exception 'not authorized';
  end if;

  select last_checkin, streak, aura
    into v_last, v_streak, v_balance
  from public.profiles
  where id = v_uid
  for update;

  if v_last = v_today then
    return jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  end if;

  if v_last = v_today - 1 then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  v_reward := case when v_balance < 0 then 7 else 5 end;
  v_new := public.apply_aura_delta_internal(
    v_uid,
    v_reward,
    'checkin',
    case when v_balance < 0 then 'Clown recovery check-in' else 'Daily check-in' end
  );
  v_applied := round((v_new - v_balance)::numeric, 1);

  update public.profiles
  set streak = v_streak,
      last_checkin = v_today,
      last_penalty_date = v_today
  where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'aura', v_new,
    'streak', v_streak,
    'reward', v_applied
  );
end;
$$;

create or replace function public.apply_inactivity_penalties_daily()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total_missed integer;
  v_already_penalized integer;
  v_days integer;
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  for r in
    select id, last_checkin, last_penalty_date
    from public.profiles
    where is_member = true
      and last_checkin is not null
  loop
    v_total_missed := least(20, greatest(0, (v_today - r.last_checkin) - 1));
    v_already_penalized := least(
      20,
      greatest(0, (coalesce(r.last_penalty_date, r.last_checkin) - r.last_checkin) - 1)
    );
    v_days := greatest(0, v_total_missed - v_already_penalized);

    if v_days > 0 then
      perform public.apply_aura_delta_internal(
        r.id,
        -2 * v_days,
        'inactivity',
        v_days::text || ' missed daily check-in' || case when v_days = 1 then '' else 's' end
      );

      update public.profiles
      set streak = 0,
          last_penalty_date = v_today - 1
      where id = r.id;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'aura-daily-penalties'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'aura-daily-penalties',
  '15 6 * * *',
  'select public.apply_inactivity_penalties_daily();'
);

do $$
declare
  v_lisha uuid;
  v_new numeric;
begin
  select id into v_lisha
  from public.profiles
  where lower(username) = 'father_lisha'
  limit 1;

  if v_lisha is not null
     and not exists (
       select 1
       from public.aura_ledger
       where user_id = v_lisha
         and type = 'admin_correction'
         and description = 'Central-time check-in correction for Nov 7, 2026'
     )
  then
    update public.profiles
    set aura = round((aura + 4.5)::numeric, 1),
        aura_all_time = greatest(coalesce(aura_all_time, 0), round((aura + 4.5)::numeric, 1)),
        streak = 41,
        last_checkin = date '2026-11-08',
        last_penalty_date = date '2026-11-08'
    where id = v_lisha
    returning aura into v_new;

    insert into public.aura_ledger(user_id, amount, type, description, balance_after)
    values(
      v_lisha,
      4.5,
      'admin_correction',
      'Central-time check-in correction for Nov 7, 2026',
      v_new
    );
  end if;
end $$;
