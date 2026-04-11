-- =============================================================================
-- SOS Responder Handshake — database changes
-- =============================================================================
-- Product note: SOS "incidents" in the app are rows in `public.sos_alerts`
-- (not the VicPol/news `incidents` feeds). Add handshake columns here.
--
-- The app stores SOS rows in `public.sos_alerts` (SOS "incidents"). Add
-- lifecycle columns used by the responder handshake UI and APIs.
--
-- Run in Supabase SQL Editor (or psql) against your project database.
-- Then ensure Realtime is enabled for `sos_alerts`: Database → Replication.
-- =============================================================================

-- 1) Columns on sos_alerts (idempotent)
ALTER TABLE public.sos_alerts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.sos_alerts
  ADD COLUMN IF NOT EXISTS responder_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

-- 2) Allowed status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sos_alerts_status_check'
  ) THEN
    ALTER TABLE public.sos_alerts
      ADD CONSTRAINT sos_alerts_status_check
      CHECK (status IN ('pending', 'accepted', 'resolved'));
  END IF;
END $$;

-- 3) Backfill from legacy resolved_at
UPDATE public.sos_alerts
SET status = 'resolved'
WHERE resolved_at IS NOT NULL AND (status IS NULL OR status <> 'resolved');

COMMENT ON COLUMN public.sos_alerts.status IS 'pending → accepted (responder assigned) → resolved';
COMMENT ON COLUMN public.sos_alerts.responder_id IS 'profiles.id of verified responder who accepted';

-- 4) nearby_sos_alerts — returns active SOS within radius with distance_meters
--    Drop first if your return type differs (uuid vs bigint id, etc.).
DROP FUNCTION IF EXISTS public.nearby_sos_alerts(double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.nearby_sos_alerts(
  p_lat double precision,
  p_lng double precision,
  radius_meters double precision
)
RETURNS TABLE (
  id uuid,
  user_id text,
  issue text,
  location_lat double precision,
  location_lng double precision,
  created_at timestamptz,
  description text,
  photo_url text,
  resolved_at timestamptz,
  status text,
  responder_id uuid,
  distance_meters double precision
)
LANGUAGE sql
STABLE
AS $func$
  SELECT
    s.id,
    s.user_id,
    s.issue::text,
    s.location_lat,
    s.location_lng,
    s.created_at,
    s.description,
    s.photo_url,
    s.resolved_at,
    s.status,
    s.responder_id,
    (
      6371000.0 * 2.0 * asin(
        sqrt(
          least(
            1.0,
            greatest(
              0.0,
              power(sin(radians((s.location_lat - p_lat) / 2.0)), 2.0)
              + cos(radians(p_lat)) * cos(radians(s.location_lat))
                * power(sin(radians((s.location_lng - p_lng) / 2.0)), 2.0)
            )
          )
        )
      )
    )::double precision AS distance_meters
  FROM public.sos_alerts s
  WHERE s.resolved_at IS NULL
    AND s.status IN ('pending', 'accepted')
    AND s.location_lat IS NOT NULL
    AND s.location_lng IS NOT NULL
    AND (
      6371000.0 * 2.0 * asin(
        sqrt(
          least(
            1.0,
            greatest(
              0.0,
              power(sin(radians((s.location_lat - p_lat) / 2.0)), 2.0)
              + cos(radians(p_lat)) * cos(radians(s.location_lat))
                * power(sin(radians((s.location_lng - p_lng) / 2.0)), 2.0)
            )
          )
        )
      )
    ) <= radius_meters;
$func$;

-- 5) Supabase Realtime — add `sos_alerts` to the realtime publication (SQL, idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sos_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
  END IF;
END $$;

-- 5b) Let the browser (anon / authenticated) call the RPC used by the map feed
GRANT EXECUTE ON FUNCTION public.nearby_sos_alerts(double precision, double precision, double precision)
  TO anon, authenticated;

-- 5c) If the API still says "schema cache" after this: wait ~1 minute, or restart the project /
--     use Dashboard options to reload PostgREST schema when available.

-- 6) Optional compatibility: expose SOS rows as "incidents" for reporting / BI
--    Skip this if you already have a different `public.incidents` table.
-- CREATE OR REPLACE VIEW public.sos_incidents AS
--   SELECT * FROM public.sos_alerts;
