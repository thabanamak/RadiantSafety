-- ============================================================================
-- Community voting on `public.user_reports` (increment upvotes / downvotes).
-- RLS only allows row owners to UPDATE directly; this SECURITY DEFINER RPC
-- lets any signed-in user vote. Run in Supabase SQL Editor once.
-- ============================================================================

create or replace function public.vote_user_report(p_report_id uuid, p_direction text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u int;
  d int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'Invalid direction';
  end if;

  if p_direction = 'up' then
    update public.user_reports r
    set upvotes = r.upvotes + 1, updated_at = now()
    where r.id = p_report_id
    returning r.upvotes, r.downvotes into u, d;
  else
    update public.user_reports r
    set downvotes = r.downvotes + 1, updated_at = now()
    where r.id = p_report_id
    returning r.upvotes, r.downvotes into u, d;
  end if;

  if u is null then
    raise exception 'Report not found';
  end if;

  return json_build_object('upvotes', u, 'downvotes', d);
end;
$$;

revoke all on function public.vote_user_report(uuid, text) from public;
grant execute on function public.vote_user_report(uuid, text) to authenticated;

comment on function public.vote_user_report(uuid, text) is
  'Authenticated users increment upvotes or downvotes on any report (RLS-safe).';
