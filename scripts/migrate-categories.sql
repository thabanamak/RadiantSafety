-- ============================================================================
-- Migration: update user_reports category CHECK + severity to match the app.
--
-- The app (types.ts / QuickReportFAB) sends new category labels but the DB
-- CHECK constraint only allowed the old ones, causing every insert to fail.
--
-- Run this once in Supabase → SQL Editor.
-- Safe to run on a table with existing rows — it maps old categories first.
-- ============================================================================

begin;

-- 1. Drop the old CHECK constraint so we can update rows
alter table public.user_reports drop constraint if exists user_reports_category_allowed;

-- 2. Map any existing rows from old → new category names
update public.user_reports set category = 'Physical Altercation' where category = 'Gang Activity';
update public.user_reports set category = 'Public Disturbance'   where category = 'Unsafe Vibe';
update public.user_reports set category = 'Environmental Hazard' where category = 'Poor Lighting';
update public.user_reports set category = 'Theft / Robbery'      where category = 'Theft';
-- 'Harassment' stays the same
update public.user_reports set category = 'Suspicious Behavior'  where category = 'Suspicious Activity';
update public.user_reports set category = 'Property Damage'      where category = 'Vandalism';
update public.user_reports set category = 'Substance Use'        where category = 'Drug Activity';

-- 3. Add new CHECK with the category labels the app actually sends
alter table public.user_reports add constraint user_reports_category_allowed check (
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
);

-- 4. Recreate the generated `severity` column with new category mappings.
--    (Generated columns can only be changed by drop + re-add.)
alter table public.user_reports drop column severity;
alter table public.user_reports add column severity smallint not null generated always as (
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
) stored;

commit;
