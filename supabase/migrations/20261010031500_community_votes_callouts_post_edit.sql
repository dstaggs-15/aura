alter table public.posts
  add column if not exists callout_target_id uuid references public.profiles(id) on delete set null,
  add column if not exists callout_sentiment text,
  add column if not exists callout_penalty numeric(12,1) not null default 0,
  add column if not exists edit_count integer not null default 0;

alter table public.posts drop constraint if exists posts_callout_sentiment_check;
alter table public.posts add constraint posts_callout_sentiment_check
  check (callout_sentiment is null or callout_sentiment in ('good','bad'));
alter table public.posts drop constraint if exists posts_callout_pair_check;
alter table public.posts add constraint posts_callout_pair_check
  check ((callout_target_id is null and callout_sentiment is null) or
         (callout_target_id is not null and callout_sentiment is not null));
alter table public.posts drop constraint if exists posts_edit_count_check;
alter table public.posts add constraint posts_edit_count_check check (edit_count between 0 and 1);

create or replace function public.validate_post_callout()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.callout_target_id is not null then
    if new.callout_target_id = new.user_id then raise exception 'you cannot call yourself out'; end if;
    if not exists(select 1 from public.profiles where id=new.callout_target_id and is_member=true) then
      raise exception 'callout target must be an Aura member';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_post_callout on public.posts;
create trigger trg_validate_post_callout before insert or update of callout_target_id,callout_sentiment,user_id on public.posts
for each row execute function public.validate_post_callout();

create or replace function public.vote_cost(p_value integer)
returns numeric language sql immutable as $$
  select case when p_value <= 5 then 0 else ceil(p_value::numeric / 10.0) end;
$$;

create or replace function public.cast_post_vote(p_post_id bigint,p_value integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_owner uuid; v_target uuid; v_callout_target uuid; v_sentiment text;
  v_old integer:=0; v_gain numeric; v_old_cost numeric; v_new_cost numeric; v_cost_delta numeric;
  v_target_balance numeric; v_tax numeric:=0; v_target_net numeric; v_new_target numeric; v_new_voter numeric;
  v_tag_count integer:=0; v_tag record; v_tag_delta numeric; v_tag_balance numeric; v_tag_tax numeric;
  v_big_count integer; v_new_post_aura numeric; v_old_penalty numeric:=0; v_new_penalty numeric:=0; v_penalty_delta numeric:=0;
begin
  if v_uid is null or not public.is_aura_member() then raise exception 'not authorized'; end if;
  if p_value=0 or abs(p_value)>100 then raise exception 'vote must be a non-zero integer from -100 to 100'; end if;

  select user_id,callout_target_id,callout_sentiment,coalesce(callout_penalty,0)
  into v_owner,v_callout_target,v_sentiment,v_old_penalty
  from public.posts where id=p_post_id for update;
  if not found then raise exception 'post not found'; end if;
  if v_owner=v_uid then raise exception 'cannot vote on your own post'; end if;
  if v_callout_target=v_uid then raise exception 'cannot vote on a callout about yourself'; end if;
  v_target:=coalesce(v_callout_target,v_owner);

  select value into v_old from public.votes where voter_id=v_uid and post_id=p_post_id for update;
  if not found then v_old:=0; end if;
  if v_old=p_value then return jsonb_build_object('ok',true,'unchanged',true); end if;

  if abs(p_value)>=50 then
    select count(*) into v_big_count from public.vote_events
    where voter_id=v_uid and target_user_id=v_target and abs(new_value)>=50
      and source_type in ('post','profile') and created_at>now()-interval '24 hours';
    if v_big_count>=3 then
      v_new_voter:=public.apply_aura_delta_internal(v_uid,-50,'anti_glaze','Too many large votes to the same person in 24h');
      insert into public.vote_events(voter_id,target_user_id,post_id,source_type,old_value,new_value,delta)
      values(v_uid,v_target,p_post_id,'penalty',v_old,v_old,-50);
      return jsonb_build_object('ok',false,'reason','anti_glaze','penalty',-50,'voter_aura',v_new_voter);
    end if;
  end if;

  if v_old=0 then insert into public.votes(voter_id,post_id,value) values(v_uid,p_post_id,p_value);
  else update public.votes set value=p_value where voter_id=v_uid and post_id=p_post_id; end if;

  v_gain:=p_value-v_old;
  v_old_cost:=public.vote_cost(v_old); v_new_cost:=public.vote_cost(p_value); v_cost_delta:=v_new_cost-v_old_cost;
  if v_cost_delta<>0 then
    v_new_voter:=public.apply_aura_delta_internal(v_uid,-v_cost_delta,'vote_cost',
      case when v_cost_delta>0 then 'Vote power cost' else 'Vote power refund' end);
  else select aura into v_new_voter from public.profiles where id=v_uid; end if;

  update public.posts set aura=round((coalesce(aura,0)+v_gain)::numeric,1)
  where id=p_post_id returning aura into v_new_post_aura;

  select aura into v_target_balance from public.profiles where id=v_target for update;
  v_target_net:=v_gain;
  if v_gain>0 and v_target_balance<0 then
    v_tax:=round((v_gain*public.clown_tax_rate(v_target_balance))::numeric,1);
    v_target_net:=v_gain-v_tax;
    update public.tax_bucket set amount=round((coalesce(amount,0)+v_tax)::numeric,1) where id=1;
  end if;

  v_new_target:=public.apply_aura_delta_internal(v_target,v_target_net,
    case when v_callout_target is not null then 'callout_vote' else 'post_vote' end,
    case when v_callout_target is not null
      then (case when p_value>0 then '+' else '' end)||p_value::text||' vote on a callout about you'
      else (case when p_value>0 then '+' else '' end)||p_value::text||' vote on your post' end);

  if v_callout_target is not null then
    v_new_penalty:=case when v_sentiment='bad' then greatest(v_new_post_aura,0)
                        when v_sentiment='good' then greatest(-v_new_post_aura,0) else 0 end;
    v_penalty_delta:=v_new_penalty-v_old_penalty;
    if v_penalty_delta<>0 then
      perform public.apply_aura_delta_internal(v_owner,-v_penalty_delta,'false_callout',
        case when v_penalty_delta>0 then 'Callout voters disagreed with your accusation'
             else 'Callout disagreement penalty adjusted' end);
    end if;
    update public.posts set callout_penalty=v_new_penalty where id=p_post_id;
  else
    select count(*) into v_tag_count from public.post_tags where post_id=p_post_id and tagged_user_id<>v_owner;
    if v_tag_count>0 and v_gain<>0 then
      v_tag_delta:=round(((v_gain*0.50)/v_tag_count)::numeric,1);
      for v_tag in select tagged_user_id from public.post_tags where post_id=p_post_id and tagged_user_id<>v_owner loop
        select aura into v_tag_balance from public.profiles where id=v_tag.tagged_user_id for update;
        v_tag_tax:=0;
        if v_tag_delta>0 and v_tag_balance<0 then
          v_tag_tax:=round((v_tag_delta*public.clown_tax_rate(v_tag_balance))::numeric,1);
          update public.tax_bucket set amount=round((coalesce(amount,0)+v_tag_tax)::numeric,1) where id=1;
        end if;
        perform public.apply_aura_delta_internal(v_tag.tagged_user_id,v_tag_delta-v_tag_tax,'tag_share','Share from a tagged post vote');
      end loop;
    end if;
  end if;

  insert into public.vote_events(voter_id,target_user_id,post_id,source_type,old_value,new_value,delta)
  values(v_uid,v_target,p_post_id,'post',v_old,p_value,v_gain);
  return jsonb_build_object('ok',true,'post_delta',v_gain,'target_aura',v_new_target,'voter_aura',v_new_voter,
                            'tax',v_tax,'callout',v_callout_target is not null,'callout_penalty',v_new_penalty);
end $$;

create or replace function public.cast_profile_vote(p_target_id uuid,p_value integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_old integer:=0; v_gain numeric; v_cost_delta numeric; v_target_balance numeric;
  v_tax numeric:=0; v_net numeric; v_new_target numeric; v_new_voter numeric; v_big_count integer;
begin
  if v_uid is null or not public.is_aura_member() then raise exception 'not authorized'; end if;
  if p_target_id=v_uid then raise exception 'cannot vote on yourself'; end if;
  if p_value=0 or abs(p_value)>100 then raise exception 'vote must be a non-zero integer from -100 to 100'; end if;
  if not exists(select 1 from public.profiles where id=p_target_id and is_member=true) then raise exception 'target not found'; end if;

  select value into v_old from public.profile_votes where voter_id=v_uid and target_id=p_target_id for update;
  if not found then v_old:=0; end if;
  if v_old=p_value then return jsonb_build_object('ok',true,'unchanged',true); end if;

  if abs(p_value)>=50 then
    select count(*) into v_big_count from public.vote_events
    where voter_id=v_uid and target_user_id=p_target_id and abs(new_value)>=50
      and source_type in ('post','profile') and created_at>now()-interval '24 hours';
    if v_big_count>=3 then
      v_new_voter:=public.apply_aura_delta_internal(v_uid,-50,'anti_glaze','Too many large votes to the same person in 24h');
      insert into public.vote_events(voter_id,target_user_id,source_type,old_value,new_value,delta)
      values(v_uid,p_target_id,'penalty',v_old,v_old,-50);
      return jsonb_build_object('ok',false,'reason','anti_glaze','penalty',-50,'voter_aura',v_new_voter);
    end if;
  end if;

  if v_old=0 then insert into public.profile_votes(voter_id,target_id,value) values(v_uid,p_target_id,p_value);
  else update public.profile_votes set value=p_value where voter_id=v_uid and target_id=p_target_id; end if;

  v_gain:=p_value-v_old; v_cost_delta:=public.vote_cost(p_value)-public.vote_cost(v_old);
  if v_cost_delta<>0 then
    v_new_voter:=public.apply_aura_delta_internal(v_uid,-v_cost_delta,'profile_vote_cost',
      case when v_cost_delta>0 then 'Profile vote power cost' else 'Profile vote power refund' end);
  else select aura into v_new_voter from public.profiles where id=v_uid; end if;

  select aura into v_target_balance from public.profiles where id=p_target_id for update;
  v_net:=v_gain;
  if v_gain>0 and v_target_balance<0 then
    v_tax:=round((v_gain*public.clown_tax_rate(v_target_balance))::numeric,1); v_net:=v_gain-v_tax;
    update public.tax_bucket set amount=round((coalesce(amount,0)+v_tax)::numeric,1) where id=1;
  end if;
  v_new_target:=public.apply_aura_delta_internal(p_target_id,v_net,'profile_vote','Profile vote changed to '||p_value::text);
  insert into public.vote_events(voter_id,target_user_id,source_type,old_value,new_value,delta)
  values(v_uid,p_target_id,'profile',v_old,p_value,v_gain);
  return jsonb_build_object('ok',true,'target_aura',v_new_target,'voter_aura',v_new_voter,'tax',v_tax);
end $$;

create or replace function public.edit_my_post(p_post_id bigint,p_text text)
returns public.posts language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_post public.posts;
begin
  if v_uid is null or not public.is_aura_member() then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_text,'')))<1 or length(trim(p_text))>2000 then raise exception 'post must be 1-2000 characters'; end if;
  update public.posts set text=trim(p_text),edit_count=edit_count+1
  where id=p_post_id and user_id=v_uid and edit_count=0 returning * into v_post;
  if not found then raise exception 'post cannot be edited again'; end if;
  return v_post;
end $$;

grant execute on function public.cast_post_vote(bigint,integer) to authenticated;
grant execute on function public.cast_profile_vote(uuid,integer) to authenticated;
grant execute on function public.edit_my_post(bigint,text) to authenticated;
