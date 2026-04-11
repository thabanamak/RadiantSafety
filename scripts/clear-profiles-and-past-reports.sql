-- Run in Supabase → SQL Editor. Clears only `profiles` (not `past_reports`).
-- Does not delete auth.users.

truncate table public.profiles restart identity cascade;
