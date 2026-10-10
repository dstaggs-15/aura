alter table public.comments
  add column if not exists parent_comment_id bigint references public.comments(id) on delete cascade;

create index if not exists comments_parent_comment_idx
  on public.comments(parent_comment_id, created_at);

create or replace function public.validate_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_post bigint;
begin
  if new.parent_comment_id is not null then
    select post_id into v_parent_post
    from public.comments
    where id = new.parent_comment_id;

    if not found then
      raise exception 'parent comment not found';
    end if;

    if v_parent_post is distinct from new.post_id then
      raise exception 'reply must belong to the same post';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_comment_reply on public.comments;
create trigger trg_validate_comment_reply
before insert or update of parent_comment_id, post_id on public.comments
for each row execute function public.validate_comment_reply();
