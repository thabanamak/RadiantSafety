-- Run in Supabase SQL editor. Friend locations: host label + roster jsonb.

ALTER TABLE public.friend_locations
  RENAME COLUMN display_name TO host_name;

ALTER TABLE public.friend_locations
  ADD COLUMN IF NOT EXISTS members jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.friend_locations.host_name IS
  'Display name for this device row (room participant).';
COMMENT ON COLUMN public.friend_locations.members IS
  'Synced JSON: { "host_device_id": "<creator device_id>", "people": [{ "device_id", "name" }, ...] }. Duplicated on each row per room.';
