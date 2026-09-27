create or replace function public.update_my_profile(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_pinned bigint;
  v_badges text[];
  v_row public.profiles%rowtype;
begin
  if v_uid is null or not public.is_aura_member() then raise exception 'not authorized'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid profile update'; end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('bio','avatar_url','banner_url','accent_color','profile_theme','pinned_post_id','custom_title','showcased_badges','profile_layout') then
      raise exception 'field not editable: %', v_key;
    end if;
  end loop;

  if p_patch ? 'pinned_post_id' then
    v_pinned := nullif(p_patch->>'pinned_post_id','')::bigint;
    if v_pinned is not null and not exists(select 1 from public.posts where id=v_pinned and user_id=v_uid) then
      raise exception 'you can only pin your own post';
    end if;
  end if;

  if p_patch ? 'showcased_badges' then
    if jsonb_typeof(p_patch->'showcased_badges') <> 'array' then raise exception 'showcased_badges must be an array'; end if;
    select coalesce(array_agg(value), '{}') into v_badges from jsonb_array_elements_text(p_patch->'showcased_badges');
    if coalesce(array_length(v_badges,1),0) > 3 then raise exception 'choose up to 3 badges'; end if;
  end if;

  if p_patch ? 'custom_title' and char_length(coalesce(p_patch->>'custom_title','')) > 40 then
    raise exception 'title must be 40 characters or fewer';
  end if;

  update public.profiles set
    bio = case when p_patch ? 'bio' then p_patch->>'bio' else bio end,
    avatar_url = case when p_patch ? 'avatar_url' then p_patch->>'avatar_url' else avatar_url end,
    banner_url = case when p_patch ? 'banner_url' then p_patch->>'banner_url' else banner_url end,
    accent_color = case when p_patch ? 'accent_color' then p_patch->>'accent_color' else accent_color end,
    profile_theme = case when p_patch ? 'profile_theme' then p_patch->>'profile_theme' else profile_theme end,
    pinned_post_id = case when p_patch ? 'pinned_post_id' then v_pinned else pinned_post_id end,
    custom_title = case when p_patch ? 'custom_title' then nullif(p_patch->>'custom_title','') else custom_title end,
    showcased_badges = case when p_patch ? 'showcased_badges' then v_badges else showcased_badges end,
    profile_layout = case when p_patch ? 'profile_layout' then p_patch->>'profile_layout' else profile_layout end
  where id=v_uid returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.update_my_profile(jsonb) from public, anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;
