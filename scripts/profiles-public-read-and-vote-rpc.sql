-- ============================================================================
-- Public read of `profiles` (reputation) + community voting on profiles.
-- Run in Supabase SQL Editor after `profiles` exists.
--
-- 1) Lets authenticated (and anon) users SELECT any profile row so the app can
--    show reputation on reporter modals. Existing "own row" policy remains.
-- 2) Per-user toggle voting — run `profile-votes-toggle.sql` after this file.
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
-- `vote_profile` toggle — see `profile-votes-toggle.sql`
-- ---------------------------------------------------------------------------
