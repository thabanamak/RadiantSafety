-- ============================================================================
-- Profiles: upvotes / downvotes (both default 0) and reputation = 50 + up - down
-- Run in Supabase → SQL Editor.
--
-- If you already have a plain `reputation` column, this drops it and replaces
-- it with a GENERATED column so it always stays in sync (no manual reputation writes).
-- Update your app to read `reputation` and only UPDATE `upvotes` / `downvotes`.
-- ============================================================================

-- --- New table (use only if `profiles` does not exist yet) -------------------

/*
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  reputation integer generated always as (50 + upvotes - downvotes) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;
*/

-- --- Migration: existing `profiles` table ------------------------------------

alter table public.profiles
  add column if not exists upvotes integer not null default 0;

alter table public.profiles
  add column if not exists downvotes integer not null default 0;

-- Optional: enforce non-negative counts
alter table public.profiles drop constraint if exists profiles_upvotes_nonnegative;
alter table public.profiles drop constraint if exists profiles_downvotes_nonnegative;
alter table public.profiles
  add constraint profiles_upvotes_nonnegative check (upvotes >= 0);
alter table public.profiles
  add constraint profiles_downvotes_nonnegative check (downvotes >= 0);

-- Replace stored reputation with computed reputation
alter table public.profiles drop column if exists reputation cascade;

alter table public.profiles
  add column reputation integer
  generated always as (50 + upvotes - downvotes) stored;

comment on column public.profiles.reputation is 'Always 50 + upvotes - downvotes; do not insert/update this column.';
