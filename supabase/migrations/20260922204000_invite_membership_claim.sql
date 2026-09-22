create extension if not exists pgcrypto with schema extensions;

create or replace function public.claim_aura_membership(p_invite_code text, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if encode(digest(coalesce(p_invite_code,''), 'sha256'), 'hex') <> 'd4a599234d6b4f76f66e0cd13c4dfc54b1ccaf70ad7f94a7fe789a7c8a240c08' then
    raise exception 'invalid invite code';
  end if;

  v_username := lower(regexp_replace(trim(coalesce(p_username,'')), '\s+', '_', 'g'));
  if v_username !~ '^[a-z0-9_]{2,30}$' then
    raise exception 'username must be 2-30 letters, numbers, or underscores';
  end if;

  if exists(select 1 from public.profiles where id=v_uid) then
    return jsonb_build_object('ok',true,'already_member',true);
  end if;

  if exists(select 1 from public.profiles where username=v_username) then
    raise exception 'username already taken';
  end if;

  insert into public.profiles(id, username, aura, aura_all_time, streak, is_member)
  values(v_uid, v_username, 100, 100, 0, true);

  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.claim_aura_membership(text,text) from public, anon;
grant execute on function public.claim_aura_membership(text,text) to authenticated;
