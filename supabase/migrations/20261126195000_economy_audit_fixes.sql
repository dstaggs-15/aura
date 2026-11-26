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
begin
  select aura into v_current from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile not found'; end if;

  v_applied := p_delta;

  if p_delta > 0 and p_type not in ('vote_cost','profile_vote_cost','false_callout','admin_correction','migration_reconcile') then
    if coalesce(v_current, 0) >= 1000 then
      v_applied := p_delta * 0.5;
    elsif coalesce(v_current, 0) + p_delta > 1000 then
      v_above_threshold := (coalesce(v_current, 0) + p_delta) - 1000;
      v_applied := (1000 - coalesce(v_current, 0)) + (v_above_threshold * 0.5);
    end if;
  end if;

  v_applied := round(v_applied::numeric, 1);
  v_new := round((coalesce(v_current,0) + v_applied)::numeric, 1);

  update public.profiles
  set aura = v_new,
      aura_all_time = greatest(coalesce(aura_all_time, 0), v_new)
  where id = p_user_id;

  insert into public.aura_ledger(user_id, amount, type, description, balance_after)
  values (p_user_id, v_applied, p_type, p_description, v_new);

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cast_profile_vote(p_target_id uuid, p_value integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_old integer := 0;
  v_gain numeric;
  v_cost_delta numeric;
  v_target_balance numeric;
  v_tax numeric := 0;
  v_net numeric;
  v_new_target numeric;
  v_new_voter numeric;
  v_big_count integer;
begin
  if v_uid is null or not public.is_aura_member() then raise exception 'not authorized'; end if;
  if p_target_id = v_uid then raise exception 'cannot vote on yourself'; end if;
  if p_value = 0 or abs(p_value) > 100 then raise exception 'vote must be a non-zero integer from -100 to 100'; end if;
  if not exists(select 1 from public.profiles where id=p_target_id and is_member=true) then raise exception 'target not found'; end if;

  select value into v_old from public.profile_votes
  where voter_id=v_uid and target_id=p_target_id
  for update;
  if not found then v_old := 0; end if;
  if v_old = p_value then return jsonb_build_object('ok',true,'unchanged',true); end if;

  if abs(p_value) >= 50 then
    select count(*) into v_big_count from public.vote_events
    where voter_id=v_uid and target_user_id=p_target_id
      and abs(new_value) >= 50 and source_type in ('post','profile')
      and created_at > now() - interval '24 hours';
    if v_big_count >= 2 then
      v_new_voter := public.apply_aura_delta_internal(v_uid,-50,'anti_glaze','Too many large votes to the same person in 24h');
      insert into public.vote_events(voter_id,target_user_id,source_type,old_value,new_value,delta)
      values(v_uid,p_target_id,'penalty',v_old,v_old,-50);
      return jsonb_build_object('ok',false,'reason','anti_glaze','penalty',-50,'voter_aura',v_new_voter);
    end if;
  end if;

  if v_old=0 then
    insert into public.profile_votes(voter_id,target_id,value) values(v_uid,p_target_id,p_value);
  else
    update public.profile_votes set value=p_value where voter_id=v_uid and target_id=p_target_id;
  end if;

  v_gain := p_value - v_old;
  v_cost_delta := public.vote_cost(p_value) - public.vote_cost(v_old);
  if v_cost_delta <> 0 then
    v_new_voter := public.apply_aura_delta_internal(v_uid,-v_cost_delta,'profile_vote_cost',
      case when v_cost_delta > 0 then 'Profile vote power cost' else 'Profile vote power refund' end);
  else
    select aura into v_new_voter from public.profiles where id=v_uid;
  end if;

  select aura into v_target_balance from public.profiles where id=p_target_id for update;
  v_net := v_gain;
  if v_gain > 0 and v_target_balance < 0 then
    v_tax := round((v_gain * public.clown_tax_rate(v_target_balance))::numeric,1);
    v_net := v_gain-v_tax;
    update public.tax_bucket set amount=round((coalesce(amount,0)+v_tax)::numeric,1) where id=1;
  end if;

  v_new_target := public.apply_aura_delta_internal(p_target_id,v_net,'profile_vote','Profile vote changed to '||p_value::text);

  insert into public.vote_events(voter_id,target_user_id,source_type,old_value,new_value,delta)
  values(v_uid,p_target_id,'profile',v_old,p_value,v_gain);

  return jsonb_build_object('ok',true,'target_aura',v_new_target,'voter_aura',v_new_voter,'tax',v_tax);
end;
$function$;

alter function public.clown_tax_rate(numeric) set search_path = public;
alter function public.vote_cost(integer) set search_path = public;

revoke execute on function public.cast_profile_vote(uuid,integer) from public,anon;
grant execute on function public.cast_profile_vote(uuid,integer) to authenticated;

revoke execute on function public.settle_weekly_round() from public,anon,authenticated;
grant execute on function public.settle_weekly_round() to service_role;

-- Reconcile legacy post scores from before the secure accounting migration.
with scores as (
  select p.id,coalesce(sum(v.value),0)::numeric as vote_sum
  from public.posts p
  left join public.votes v on v.post_id=p.id
  group by p.id
)
update public.posts p
set aura=round(s.vote_sum,1)
from scores s
where p.id=s.id
  and p.created_at < timestamp '2026-09-23'
  and round(p.aura::numeric,1) <> round(s.vote_sum,1);

-- Restore historical refunds/reversals that were incorrectly subjected
-- to the 50% positive-gain rule above 1,000 Aura.
do $$
declare
  v_uid uuid;
  v_current numeric;
  v_new numeric;
  r record;
begin
  for r in
    select * from (values
      ('dannythe🐐'::text, 18.5::numeric),
      ('libster'::text, 1.0::numeric),
      ('lorlorstaggsy'::text, 2.5::numeric)
    ) as x(username,amount)
  loop
    select id,aura into v_uid,v_current
    from public.profiles
    where lower(username)=lower(r.username)
    for update;

    if v_uid is null then
      raise exception 'profile not found for %', r.username;
    end if;

    if not exists (
      select 1 from public.aura_ledger
      where user_id=v_uid
        and type='economy_audit_refund'
        and description='Refund audit: restore Aura lost to 1000+ refund halving'
    ) then
      v_new := round((v_current+r.amount)::numeric,1);

      update public.profiles
      set aura=v_new,
          aura_all_time=greatest(coalesce(aura_all_time,0),v_new)
      where id=v_uid;

      insert into public.aura_ledger(user_id,amount,type,description,balance_after)
      values(
        v_uid,r.amount,'economy_audit_refund',
        'Refund audit: restore Aura lost to 1000+ refund halving',
        v_new
      );
    end if;
  end loop;
end $$;
