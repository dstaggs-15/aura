CREATE OR REPLACE FUNCTION public.apply_aura_delta_internal(p_user_id uuid, p_delta numeric, p_type text, p_description text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current numeric;
  v_new numeric;
  v_applied numeric;
  v_above_threshold numeric;
  v_pool_add numeric := 0;
begin
  select aura into v_current
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  v_applied := p_delta;

  if p_delta > 0
     and p_type not in ('vote_cost','profile_vote_cost','false_callout','admin_correction','migration_reconcile')
  then
    if coalesce(v_current,0) >= 1000 then
      v_applied := round((p_delta * 0.75)::numeric,1);
      v_pool_add := round((p_delta - v_applied)::numeric,1);
    elsif coalesce(v_current,0) + p_delta > 1000 then
      v_above_threshold := (coalesce(v_current,0) + p_delta) - 1000;
      v_applied := round(((1000 - coalesce(v_current,0)) + (v_above_threshold * 0.75))::numeric,1);
      v_pool_add := round((p_delta - v_applied)::numeric,1);
    end if;
  end if;

  v_applied := round(v_applied::numeric,1);
  v_new := round((coalesce(v_current,0) + v_applied)::numeric,1);

  update public.profiles
  set aura = v_new,
      aura_all_time = greatest(coalesce(aura_all_time,0),v_new)
  where id = p_user_id;

  if v_pool_add > 0 then
    update public.tax_bucket
    set amount = round((coalesce(amount,0) + v_pool_add)::numeric,1)
    where id = 1;
  end if;

  insert into public.aura_ledger(user_id,amount,type,description,balance_after)
  values (p_user_id,v_applied,p_type,p_description,v_new);

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_weekly_round()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start timestamptz := date_trunc('week', now()) - interval '7 days';
  v_end timestamptz := date_trunc('week', now());
  v_post bigint;
  v_user uuid;
  v_pool numeric;
begin
  if exists(
    select 1
    from public.weekly_rounds
    where starts_at=v_start
      and settled_at is not null
  ) then
    return;
  end if;

  select id,user_id into v_post,v_user
  from public.posts
  where created_at >= v_start
    and created_at < v_end
  order by aura desc, created_at asc
  limit 1;

  select coalesce(amount,0) into v_pool
  from public.tax_bucket
  where id=1
  for update;

  insert into public.weekly_rounds(
    starts_at,ends_at,winner_post_id,winner_user_id,pool_amount,settled_at
  )
  values(v_start,v_end,v_post,v_user,v_pool,now())
  on conflict do nothing;

  if v_user is not null and v_pool > 0 then
    -- Empty the settled pool first. If the winner is at 1,000+ Aura,
    -- apply_aura_delta_internal sends 25% of the prize back here,
    -- which becomes the seed for the next weekly pool.
    update public.tax_bucket
    set amount=0,last_reset=current_date
    where id=1;

    perform public.apply_aura_delta_internal(
      v_user,
      v_pool,
      'weekly_prize',
      'Weekly top post prize'
    );
  end if;
end;
$function$;

revoke execute on function public.apply_aura_delta_internal(uuid,numeric,text,text) from public,anon,authenticated;
grant execute on function public.apply_aura_delta_internal(uuid,numeric,text,text) to service_role;

revoke execute on function public.settle_weekly_round() from public,anon,authenticated;
grant execute on function public.settle_weekly_round() to service_role;
