-- ============================================================================
-- Greenfield setup: `user_reports` + vote toggling (matches RadiantSafety app).
-- Run once in Supabase → SQL Editor.
--
-- Includes:
--   • public.user_reports — trust / trust_label generated columns; severity; RLS
--   • public.user_report_votes — one vote per user per report
--   • public.toggle_user_report_vote — RPC used by the web app
--
-- Destroys existing data: DROP CASCADE removes dependent objects (votes, etc.).
-- After this, enable Realtime on `user_reports` in Dashboard → Database →
-- Replication if you want live feed updates without refresh.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Core table
-- ---------------------------------------------------------------------------
drop table if exists public.user_reports cascade;

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  description text not null default '',
  image_url text,
  category text not null,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reports_category_allowed check (
    category in (
      'Physical Altercation',
      'Harassment',
      'Theft / Robbery',
      'Public Disturbance',
      'Suspicious Behavior',
      'Substance Use',
      'Property Damage',
      'Environmental Hazard'
    )
  ),
  constraint user_reports_upvotes_nonnegative check (upvotes >= 0),
  constraint user_reports_downvotes_nonnegative check (downvotes >= 0),
  severity smallint not null generated always as (
    case category
      when 'Physical Altercation' then 10
      when 'Harassment' then 9
      when 'Environmental Hazard' then 8
      when 'Substance Use' then 8
      when 'Public Disturbance' then 7
      when 'Theft / Robbery' then 7
      when 'Property Damage' then 6
      when 'Suspicious Behavior' then 5
      else 5
    end
  ) stored,
  trust integer not null generated always as (10 + upvotes - downvotes) stored,
  trust_label text not null generated always as (
    case
      when (10 + upvotes - downvotes) >= 20 then 'Trustworthy'
      when (10 + upvotes - downvotes) >= 15 then 'Semi-trustworthy'
      when (10 + upvotes - downvotes) >= 6 then 'Medium trust'
      else 'Untrustworthy'
    end
  ) stored
);

create index user_reports_location_idx on public.user_reports (latitude, longitude);
create index user_reports_user_idx on public.user_reports (user_id);

comment on table public.user_reports is 'Community reports; trust = 10+up−down; severity from category.';
comment on column public.user_reports.trust is 'Generated; row removed by trigger if < 0.';
comment on column public.user_reports.trust_label is 'Trustworthy ≥20; Semi 15–19; Medium 6–14; else Untrustworthy.';

-- Remove rows when trust would go negative (votes go through toggle RPC).
create or replace function public.user_reports_delete_if_negative_trust()
returns trigger
language plpgsql
as $$
begin
  if (10 + new.upvotes - new.downvotes) < 0 then
    delete from public.user_reports where id = new.id;
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_reports_negative_trust_after on public.user_reports;
create trigger user_reports_negative_trust_after
  after insert or update of upvotes, downvotes
  on public.user_reports
  for each row
  when (10 + new.upvotes - new.downvotes < 0)
  execute function public.user_reports_delete_if_negative_trust();

alter table public.user_reports enable row level security;

drop policy if exists "user_reports_select_authenticated" on public.user_reports;
create policy "user_reports_select_authenticated"
  on public.user_reports for select to authenticated using (true);

drop policy if exists "user_reports_select_anon" on public.user_reports;
create policy "user_reports_select_anon"
  on public.user_reports for select to anon using (true);

drop policy if exists "user_reports_insert_own" on public.user_reports;
create policy "user_reports_insert_own"
  on public.user_reports for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_reports_update_own" on public.user_reports;
create policy "user_reports_update_own"
  on public.user_reports for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_reports_delete_own" on public.user_reports;
create policy "user_reports_delete_own"
  on public.user_reports for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Per-user votes (app: fetch + toggle)
-- ---------------------------------------------------------------------------
create table public.user_report_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid not null references public.user_reports (id) on delete cascade,
  side text not null check (side in ('up', 'down')),
  created_at timestamptz not null default now(),
  primary key (user_id, report_id)
);

create index user_report_votes_report_id_idx
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
-- 3. Toggle vote RPC (SECURITY DEFINER updates counts; RLS bypassed inside)
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

drop function if exists public.vote_user_report(uuid, text);

comment on function public.toggle_user_report_vote(uuid, text) is
  'Toggle or switch vote on someone else''s report (not your own); returns counts, trust, trust_label, my_vote.';
