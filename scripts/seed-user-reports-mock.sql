-- ============================================================================
-- Seed `public.user_reports` with the same demo rows as `src/lib/mock-data.ts`.
--
-- 1. Replace YOUR_EMAIL@example.com with a real Supabase Auth user email.
-- 2. Run in Supabase → SQL Editor.
-- 3. trust / severity / trust_label are generated columns — do not insert them.
-- ============================================================================

insert into public.user_reports (
  user_id,
  latitude,
  longitude,
  description,
  category,
  upvotes,
  downvotes,
  created_at
)
select
  u.id,
  v.latitude,
  v.longitude,
  v.description,
  v.category,
  v.upvotes,
  v.downvotes,
  v.created_at
from (
  values
    (
      -37.8095::double precision,
      144.968::double precision,
      'Group of 6+ intimidating pedestrians near Flinders Lane',
      'Gang Activity',
      42,
      2,
      now() - interval '3 minutes'
    ),
    (
      -37.812,
      144.9655,
      'Dark alleyway with no foot traffic, felt very unsafe',
      'Unsafe Vibe',
      18,
      0,
      now() - interval '12 minutes'
    ),
    (
      -37.815,
      144.959,
      'Multiple streetlights out along Southbank Promenade',
      'Poor Lighting',
      31,
      1,
      now() - interval '25 minutes'
    ),
    (
      -37.807,
      144.971,
      'Phone snatched from hand near Southern Cross Station',
      'Theft',
      27,
      3,
      now() - interval '45 minutes'
    ),
    (
      -37.811,
      144.972,
      'Individual following people through Queen Victoria Market',
      'Suspicious Activity',
      12,
      4,
      now() - interval '60 minutes'
    ),
    (
      -37.818,
      144.956,
      'Open drug use near Crown Casino underpass',
      'Drug Activity',
      35,
      2,
      now() - interval '90 minutes'
    ),
    (
      -37.806,
      144.963,
      'Verbal harassment reported near Melbourne Central',
      'Harassment',
      22,
      1,
      now() - interval '120 minutes'
    ),
    (
      -37.81,
      144.96,
      'Car windows smashed on Little Collins Street',
      'Vandalism',
      15,
      2,
      now() - interval '180 minutes'
    )
) as v(latitude, longitude, description, category, upvotes, downvotes, created_at)
cross join lateral (
  select id
  from auth.users
  where email = 'YOUR_EMAIL@example.com'
  limit 1
) as u;
