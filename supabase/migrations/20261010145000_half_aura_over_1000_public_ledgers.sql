create or replace function public.apply_aura_delta_internal(
  p_user_id uuid,
  p_delta numeric,
  p_type text,
  p_description text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
  v_new numeric;
  v_applied numeric;
  v_above_threshold numeric;
begin
  select aura into v_current from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile not found'; end if;

  v_applied := p_delta;

  if p_delta > 0 then
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
$$;

drop policy if exists ledger_self_read on public.aura_ledger;
drop policy if exists ledger_member_read on public.aura_ledger;
create policy ledger_member_read
on public.aura_ledger
for select
to authenticated
using (public.is_aura_member());

grant select on public.aura_ledger to authenticated;
