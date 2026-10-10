CREATE OR REPLACE FUNCTION public.cast_post_vote(p_post_id bigint, p_value integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_primary_target uuid;
  v_sentiment text;
  v_old integer := 0;
  v_gain numeric;
  v_old_cost numeric;
  v_new_cost numeric;
  v_cost_delta numeric;
  v_new_voter numeric;
  v_big_count integer := 0;
  v_new_post_aura numeric;
  v_old_penalty numeric := 0;
  v_new_penalty numeric := 0;
  v_penalty_delta numeric := 0;

  v_callout_count integer := 0;
  v_target_rec record;
  v_target_balance numeric;
  v_target_delta numeric;
  v_target_net numeric;
  v_target_tax numeric;
  v_remaining numeric;
  v_idx integer := 0;

  v_tag_count integer := 0;
  v_tag record;
  v_tag_delta numeric;
  v_tag_balance numeric;
  v_tag_tax numeric;
begin
  if v_uid is null or not public.is_aura_member() then
    raise exception 'not authorized';
  end if;

  if p_value = 0 or abs(p_value) > 100 then
    raise exception 'vote must be a non-zero integer from -100 to 100';
  end if;

  select user_id, callout_target_id, callout_sentiment, coalesce(callout_penalty,0)
    into v_owner, v_primary_target, v_sentiment, v_old_penalty
  from public.posts
  where id = p_post_id
  for update;

  if not found then raise exception 'post not found'; end if;
  if v_owner = v_uid then raise exception 'cannot vote on your own post'; end if;

  if v_sentiment is not null then
    select count(*) into v_callout_count
    from (
      select distinct tagged_user_id
      from public.post_tags
      where post_id = p_post_id and tagged_user_id <> v_owner
    ) q;

    if v_callout_count = 0 and v_primary_target is not null then
      v_callout_count := 1;
    end if;

    if v_callout_count = 0 then
      raise exception 'callout has no targets';
    end if;

    if exists(
      select 1 from public.post_tags
      where post_id = p_post_id and tagged_user_id = v_uid
    ) or (not exists(select 1 from public.post_tags where post_id=p_post_id) and v_primary_target = v_uid) then
      raise exception 'cannot vote on a callout about yourself';
    end if;
  end if;

  select value into v_old
  from public.votes
  where voter_id = v_uid and post_id = p_post_id
  for update;

  if not found then v_old := 0; end if;
  if v_old = p_value then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  if abs(p_value) >= 50 then
    if v_sentiment is not null then
      select coalesce(max(cnt),0) into v_big_count
      from (
        select ve.target_user_id, count(*) cnt
        from public.vote_events ve
        where ve.voter_id = v_uid
          and ve.target_user_id in (
            select tagged_user_id from public.post_tags where post_id = p_post_id
            union
            select v_primary_target where v_primary_target is not null
          )
          and abs(ve.new_value) >= 50
          and ve.source_type in ('post','profile')
          and ve.created_at > now() - interval '24 hours'
        group by ve.target_user_id
      ) x;
    else
      select count(*) into v_big_count
      from public.vote_events
      where voter_id = v_uid
        and target_user_id = v_owner
        and abs(new_value) >= 50
        and source_type in ('post','profile')
        and created_at > now() - interval '24 hours';
    end if;

    if v_big_count >= 3 then
      v_new_voter := public.apply_aura_delta_internal(
        v_uid, -50, 'anti_glaze', 'Too many large votes to the same person in 24h'
      );

      insert into public.vote_events(voter_id,target_user_id,post_id,source_type,old_value,new_value,delta)
      values(v_uid,coalesce(v_primary_target,v_owner),p_post_id,'penalty',v_old,v_old,-50);

      return jsonb_build_object('ok',false,'reason','anti_glaze','penalty',-50,'voter_aura',v_new_voter);
    end if;
  end if;

  if v_old = 0 then
    insert into public.votes(voter_id,post_id,value) values(v_uid,p_post_id,p_value);
  else
    update public.votes set value=p_value where voter_id=v_uid and post_id=p_post_id;
  end if;

  v_gain := p_value - v_old;
  v_old_cost := public.vote_cost(v_old);
  v_new_cost := public.vote_cost(p_value);
  v_cost_delta := v_new_cost - v_old_cost;

  if v_cost_delta <> 0 then
    v_new_voter := public.apply_aura_delta_internal(
      v_uid, -v_cost_delta, 'vote_cost',
      case when v_cost_delta > 0 then 'Vote power cost' else 'Vote power refund' end
    );
  else
    select aura into v_new_voter from public.profiles where id=v_uid;
  end if;

  update public.posts
  set aura = round((coalesce(aura,0) + v_gain)::numeric,1)
  where id = p_post_id
  returning aura into v_new_post_aura;

  if v_sentiment is not null then
    v_remaining := v_gain;
    v_idx := 0;

    for v_target_rec in
      select tagged_user_id as id
      from public.post_tags
      where post_id = p_post_id and tagged_user_id <> v_owner
      group by tagged_user_id
      order by tagged_user_id
    loop
      v_idx := v_idx + 1;
      if v_idx = v_callout_count then
        v_target_delta := v_remaining;
      else
        v_target_delta := round((v_gain / v_callout_count)::numeric,1);
        v_remaining := round((v_remaining - v_target_delta)::numeric,1);
      end if;

      select aura into v_target_balance from public.profiles where id=v_target_rec.id for update;
      v_target_tax := 0;
      v_target_net := v_target_delta;

      if v_target_delta > 0 and v_target_balance < 0 then
        v_target_tax := round((v_target_delta * public.clown_tax_rate(v_target_balance))::numeric,1);
        v_target_net := v_target_delta - v_target_tax;
        update public.tax_bucket
        set amount = round((coalesce(amount,0) + v_target_tax)::numeric,1)
        where id = 1;
      end if;

      perform public.apply_aura_delta_internal(
        v_target_rec.id,
        v_target_net,
        'callout_vote',
        case when p_value > 0 then '+' else '' end || p_value::text || ' vote on a callout about you'
      );

      insert into public.vote_events(voter_id,target_user_id,post_id,source_type,old_value,new_value,delta)
      values(v_uid,v_target_rec.id,p_post_id,'post',v_old,p_value,v_gain);
    end loop;

    if v_idx = 0 and v_primary_target is not null then
      select aura into v_target_balance from public.profiles where id=v_primary_target for update;
      v_target_tax := 0;
      v_target_net := v_gain;

      if v_gain > 0 and v_target_balance < 0 then
        v_target_tax := round((v_gain * public.clown_tax_rate(v_target_balance))::numeric,1);
        v_target_net := v_gain - v_target_tax;
        update public.tax_bucket
        set amount = round((coalesce(amount,0) + v_target_tax)::numeric,1)
        where id = 1;
      end if;

      perform public.apply_aura_delta_internal(
        v_primary_target,
        v_target_net,
        'callout_vote',
        case when p_value > 0 then '+' else '' end || p_value::text || ' vote on a callout about you'
      );

      insert into public.vote_events(voter_id,target_user_id,post_id,source_type,old_value,new_value,delta)
      values(v_uid,v_primary_target,p_post_id,'post',v_old,p_value,v_gain);
    end if;

    v_new_penalty := case
      when v_sentiment = 'bad' then greatest(v_new_post_aura,0)
      when v_sentiment = 'good' then greatest(-v_new_post_aura,0)
      else 0
    end;

    v_penalty_delta := v_new_penalty - v_old_penalty;

    if v_penalty_delta <> 0 then
      perform public.apply_aura_delta_internal(
        v_owner,
        -v_penalty_delta,
        'false_callout',
        case
          when v_penalty_delta > 0 then 'Callout voters disagreed with your accusation'
          else 'Callout disagreement penalty adjusted'
        end
      );
    end if;

    update public.posts set callout_penalty=v_new_penalty where id=p_post_id;
  else
    select aura into v_target_balance from public.profiles where id=v_owner for update;
    v_target_net := v_gain;
    v_target_tax := 0;

    if v_gain > 0 and v_target_balance < 0 then
      v_target_tax := round((v_gain * public.clown_tax_rate(v_target_balance))::numeric,1);
      v_target_net := v_gain - v_target_tax;
      update public.tax_bucket
      set amount=round((coalesce(amount,0)+v_target_tax)::numeric,1)
      where id=1;
    end if;

    perform public.apply_aura_delta_internal(
      v_owner,
      v_target_net,
      'post_vote',
      case when p_value > 0 then '+' else '' end || p_value::text || ' vote on your post'
    );

    select count(*) into v_tag_count
    from public.post_tags where post_id=p_post_id and tagged_user_id<>v_owner;

    if v_tag_count>0 and v_gain<>0 then
      v_tag_delta:=round(((v_gain*0.50)/v_tag_count)::numeric,1);
      for v_tag in
        select tagged_user_id from public.post_tags
        where post_id=p_post_id and tagged_user_id<>v_owner
      loop
        select aura into v_tag_balance from public.profiles where id=v_tag.tagged_user_id for update;
        v_tag_tax:=0;
        if v_tag_delta>0 and v_tag_balance<0 then
          v_tag_tax:=round((v_tag_delta*public.clown_tax_rate(v_tag_balance))::numeric,1);
          update public.tax_bucket
          set amount=round((coalesce(amount,0)+v_tag_tax)::numeric,1)
          where id=1;
        end if;

        perform public.apply_aura_delta_internal(
          v_tag.tagged_user_id,
          v_tag_delta-v_tag_tax,
          'tag_share',
          'Share from a tagged post vote'
        );
      end loop;
    end if;

    insert into public.vote_events(voter_id,target_user_id,post_id,source_type,old_value,new_value,delta)
    values(v_uid,v_owner,p_post_id,'post',v_old,p_value,v_gain);
  end if;

  return jsonb_build_object(
    'ok',true,
    'post_delta',v_gain,
    'voter_aura',v_new_voter,
    'callout',v_sentiment is not null,
    'callout_targets',v_callout_count,
    'callout_penalty',v_new_penalty
  );
end;
$function$


grant execute on function public.cast_post_vote(bigint,integer) to authenticated;
