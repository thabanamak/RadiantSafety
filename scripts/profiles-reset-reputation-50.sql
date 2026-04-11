-- ============================================================================
-- Set every profile's reputation to 50 (Supabase SQL Editor).
-- reputation is generated: 50 + upvotes - downvotes → use upvotes/downvotes = 0.
-- Optional: clear profile_votes so per-user votes match the reset counts.
-- ============================================================================

update public.profiles
set
  upvotes = 0,
  downvotes = 0,
  updated_at = now();

-- Uncomment to also remove stored approve/disapprove rows (keeps DB consistent with zeros above):
-- truncate table public.profile_votes restart identity;
