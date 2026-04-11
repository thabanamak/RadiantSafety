-- ============================================================================
-- Per-user toggle votes on `user_reports` + replace increment-only RPC.
-- Run in Supabase SQL Editor after `user_reports` exists.
--
-- Each signed-in user has at most one vote per report (`up` or `down`).
-- Clicking the same button again removes the vote; clicking the opposite
-- switches the vote. `user_reports.trust` / `trust_label` stay generated.
-- ============================================================================

create table if not exists public.user_report_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid not null references public.user_reports (id) on delete cascade,
  side text not null check (side in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (user_id, report_id)
);

create index if not exists user_report_votes_report_id_idx
  on public.user_report_votes (report_id);

alter table public.user_report_votes enable row level security;

drop policy if exists "user_report_votes_select_own" on public.user_report_votes;
create policy "user_report_votes_select_own"
  on public.user_report_votes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_report_votes_insert_own" on public.user_report_votes;
create policy "user_report_votes_insert_own"
  on public.user_report_votes for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_report_votes_update_own" on public.user_report_votes;
create policy "user_report_votes_update_own"
  on public.user_report_votes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_report_votes_delete_own" on public.user_report_votes;
create policy "user_report_votes_delete_own"
  on public.user_report_votes for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Toggle vote (SECURITY DEFINER — adjusts user_reports + user_report_votes)
-- ---------------------------------------------------------------------------
drop function if exists public.toggle_user_report_vote(uuid, text);

create or replace function public.toggle_user_report_vote(p_report_id uuid, p_side text)
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
  t int;
  tl text;
  mv text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_side is null or p_side not in ('up', 'down') then
    raise exception 'Invalid side';
  end if;

  if exists (
    select 1
    from public.user_reports r
    where r.id = p_report_id and r.user_id = uid
  ) then
    raise exception 'Cannot vote on your own report';
  end if;

  select v.side into cur
  from public.user_report_votes v
  where v.user_id = uid and v.report_id = p_report_id;

  if p_side = 'up' then
    if cur = 'up' then
      delete from public.user_report_votes
      where user_id = uid and report_id = p_report_id;
      update public.user_reports r
      set upvotes = greatest(0, r.upvotes - 1), updated_at = now()
      where r.id = p_report_id;
    elsif cur = 'down' then
      update public.user_report_votes set side = 'up', created_at = now()
      where user_id = uid and report_id = p_report_id;
      update public.user_reports r
      set
        upvotes = r.upvotes + 1,
        downvotes = greatest(0, r.downvotes - 1),
        updated_at = now()
      where r.id = p_report_id;
    else
      insert into public.user_report_votes (user_id, report_id, side)
      values (uid, p_report_id, 'up');
      update public.user_reports r
      set upvotes = r.upvotes + 1, updated_at = now()
      where r.id = p_report_id;
    end if;
  else
    -- p_side = 'down'
    if cur = 'down' then
      delete from public.user_report_votes
      where user_id = uid and report_id = p_report_id;
      update public.user_reports r
      set downvotes = greatest(0, r.downvotes - 1), updated_at = now()
      where r.id = p_report_id;
    elsif cur = 'up' then
      update public.user_report_votes set side = 'down', created_at = now()
      where user_id = uid and report_id = p_report_id;
      update public.user_reports r
      set
        upvotes = greatest(0, r.upvotes - 1),
        downvotes = r.downvotes + 1,
        updated_at = now()
      where r.id = p_report_id;
    else
      insert into public.user_report_votes (user_id, report_id, side)
      values (uid, p_report_id, 'down');
      update public.user_reports r
      set downvotes = r.downvotes + 1, updated_at = now()
      where r.id = p_report_id;
    end if;
  end if;

  select v.side into mv
  from public.user_report_votes v
  where v.user_id = uid and v.report_id = p_report_id;

  select r.upvotes, r.downvotes, r.trust, r.trust_label
  into u, d, t, tl
  from public.user_reports r
  where r.id = p_report_id;

  if u is null then
    raise exception 'Report not found';
  end if;

  return json_build_object(
    'upvotes', u,
    'downvotes', d,
    'trust', t,
    'trust_label', tl,
    'my_vote', mv
  );
end;
$$;

revoke all on function public.toggle_user_report_vote(uuid, text) from public;
grant execute on function public.toggle_user_report_vote(uuid, text) to authenticated;

-- Deprecate old increment-only RPC (optional: drop entirely)
drop function if exists public.vote_user_report(uuid, text);

comment on function public.toggle_user_report_vote(uuid, text) is
  'Toggle or switch vote on someone else''s report (not your own); returns counts, trust, trust_label, my_vote.';
