-- ============================================================================
-- Public read of `profiles` (reputation) + community voting on profiles.
-- Run in Supabase SQL Editor after `profiles` exists.
--
-- 1) Lets authenticated (and anon) users SELECT any profile row so the app can
--    show reputation on reporter modals. Existing "own row" policy remains.
-- 2) `vote_profile` — SECURITY DEFINER RPC so others can increment upvotes /
--    downvotes (RLS otherwise blocks updating someone else's row).
--
-- Enable Realtime for `public.profiles` in Dashboard → Database → Replication
-- if you want live reputation updates in the UI.
-- ============================================================================

drop policy if exists "profiles_select_public_read" on public.profiles;
create policy "profiles_select_public_read"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_select_anon_read" on public.profiles;
create policy "profiles_select_anon_read"
  on public.profiles for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- vote_profile: authenticated users vote another user's profile (not self).
-- ---------------------------------------------------------------------------
create or replace function public.vote_profile(p_profile_id uuid, p_direction text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u int;
  d int;
  rep int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if auth.uid() = p_profile_id then
    raise exception 'Cannot vote on your own profile';
  end if;
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'Invalid direction';
  end if;

  if p_direction = 'up' then
    update public.profiles p
    set upvotes = p.upvotes + 1, updated_at = now()
    where p.id = p_profile_id
    returning p.upvotes, p.downvotes, p.reputation into u, d, rep;
  else
    update public.profiles p
    set downvotes = p.downvotes + 1, updated_at = now()
    where p.id = p_profile_id
    returning p.upvotes, p.downvotes, p.reputation into u, d, rep;
  end if;

  if u is null then
    raise exception 'Profile not found';
  end if;

  return json_build_object('upvotes', u, 'downvotes', d, 'reputation', rep);
end;
$$;

revoke all on function public.vote_profile(uuid, text) from public;
grant execute on function public.vote_profile(uuid, text) to authenticated;

comment on function public.vote_profile(uuid, text) is
  'Increment profile upvotes or downvotes for another user (not self).';
