-- ============================================================================
-- Fresh `public.profiles` (Supabase) — run in SQL Editor after dropping the old table.
--
-- Reputation is always 50 + upvotes - downvotes (generated; do not INSERT/UPDATE it).
-- App inserts: id, username, upvotes, downvotes, created_at, updated_at.
-- ============================================================================

-- Uncomment only if you need to wipe and recreate:
-- drop table if exists public.profiles cascade;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  reputation integer generated always as (50 + upvotes - downvotes) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_upvotes_nonnegative check (upvotes >= 0),
  constraint profiles_downvotes_nonnegative check (downvotes >= 0)
);

create unique index profiles_username_key on public.profiles (username);

comment on table public.profiles is 'One row per auth user; reputation is derived from votes.';
comment on column public.profiles.reputation is 'Always 50 + upvotes - downvotes; do not insert/update this column.';

alter table public.profiles enable row level security;

-- Authenticated users can manage only their own row (matches client using user JWT).
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
