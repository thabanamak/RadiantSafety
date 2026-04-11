-- ============================================================================
-- Run this ENTIRE script in Supabase → SQL Editor (one run).
--
-- Problem: profiles.id foreign-key points at public.users (or "users"), but
-- Supabase login creates rows in auth.users only → insert fails with code 23503.
--
-- Fix: point profiles.id at auth.users(id) instead.
-- ============================================================================

-- If your FK has a different name, list constraints first:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.profiles'::regclass AND contype = 'f';

BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Remove profile rows that don’t match any real Auth user (safe cleanup)
DELETE FROM public.profiles AS p
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users AS u WHERE u.id = p.id
);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

COMMIT;
