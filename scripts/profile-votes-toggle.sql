-- ============================================================================
-- Per-user toggle votes on profiles (approve / disapprove).
-- Run in Supabase SQL Editor after `public.profiles` exists.
--
-- Each voter has at most one active vote per profile (`up` = approve, `down` = disapprove).
-- Same choice again removes the vote (reverts counts); the other choice switches the vote.
-- ============================================================================

create table if not exists public.profile_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  side text not null check (side in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

create index if not exists profile_votes_profile_id_idx
  on public.profile_votes (profile_id);

alter table public.profile_votes enable row level security;

drop policy if exists "profile_votes_select_own" on public.profile_votes;
create policy "profile_votes_select_own"
  on public.profile_votes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profile_votes_insert_own" on public.profile_votes;
create policy "profile_votes_insert_own"
  on public.profile_votes for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profile_votes_update_own" on public.profile_votes;
create policy "profile_votes_update_own"
  on public.profile_votes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "profile_votes_delete_own" on public.profile_votes;
create policy "profile_votes_delete_own"
  on public.profile_votes for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Toggle vote on another user's profile (SECURITY DEFINER).
-- ---------------------------------------------------------------------------
create or replace function public.vote_profile(p_profile_id uuid, p_direction text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur text;
  u int;
  d int;
  rep int;
  mv text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if uid = p_profile_id then
    raise exception 'Cannot vote on your own profile';
  end if;
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'Invalid direction';
  end if;

  select v.side into cur
  from public.profile_votes v
  where v.user_id = uid and v.profile_id = p_profile_id;

  if p_direction = 'up' then
    -- Uncheck approve: delete vote row and set profiles.upvotes = upvotes - 1 (floored at 0).
    if cur = 'up' then
      delete from public.profile_votes
      where user_id = uid and profile_id = p_profile_id;
      update public.profiles p
      set upvotes = greatest(0, p.upvotes - 1), updated_at = now()
      where p.id = p_profile_id;
    elsif cur = 'down' then
      update public.profile_votes set side = 'up', created_at = now()
      where user_id = uid and profile_id = p_profile_id;
      update public.profiles p
      set
        upvotes = p.upvotes + 1,
        downvotes = greatest(0, p.downvotes - 1),
        updated_at = now()
      where p.id = p_profile_id;
    else
      insert into public.profile_votes (user_id, profile_id, side)
      values (uid, p_profile_id, 'up');
      update public.profiles p
      set upvotes = p.upvotes + 1, updated_at = now()
      where p.id = p_profile_id;
    end if;
  else
    -- Second click on disapprove: remove vote and decrement downvotes.
    if cur = 'down' then
      delete from public.profile_votes
      where user_id = uid and profile_id = p_profile_id;
      update public.profiles p
      set downvotes = greatest(0, p.downvotes - 1), updated_at = now()
      where p.id = p_profile_id;
    elsif cur = 'up' then
      update public.profile_votes set side = 'down', created_at = now()
      where user_id = uid and profile_id = p_profile_id;
      update public.profiles p
      set
        upvotes = greatest(0, p.upvotes - 1),
        downvotes = p.downvotes + 1,
        updated_at = now()
      where p.id = p_profile_id;
    else
      insert into public.profile_votes (user_id, profile_id, side)
      values (uid, p_profile_id, 'down');
      update public.profiles p
      set downvotes = p.downvotes + 1, updated_at = now()
      where p.id = p_profile_id;
    end if;
  end if;

  select v.side into mv
  from public.profile_votes v
  where v.user_id = uid and v.profile_id = p_profile_id;

  select p.upvotes, p.downvotes, p.reputation into u, d, rep
  from public.profiles p
  where p.id = p_profile_id;

  if u is null then
    raise exception 'Profile not found';
  end if;

  return json_build_object(
    'upvotes', u,
    'downvotes', d,
    'reputation', rep,
    'my_vote', mv
  );
end;
$$;

revoke all on function public.vote_profile(uuid, text) from public;
revoke all on function public.vote_profile(uuid, text) from anon;
grant execute on function public.vote_profile(uuid, text) to authenticated;

comment on function public.vote_profile(uuid, text) is
  'Toggle approve/disapprove; same side clears vote; opposite side switches.';

comment on table public.profile_votes is
  'At most one approve (up) or disapprove (down) per voter per profile.';
