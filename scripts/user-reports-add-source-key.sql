-- Run once if `user_reports` already exists without `source_key` (needed for official-incident upserts).
--
-- Next.js import API also needs (server env, e.g. .env.local):
--   SUPABASE_SERVICE_KEY = service_role key (Settings → API). Required: anon key cannot insert past RLS.
--   SUPABASE_IMPORT_USER_ID = uuid of an existing auth.users row (e.g. a demo account) for imported rows.

alter table public.user_reports
  add column if not exists source_key text;

create unique index if not exists user_reports_source_key_uidx
  on public.user_reports (source_key)
  where source_key is not null;

comment on column public.user_reports.source_key is
  'Stable key for imported VicPol/historical rows (vicpol:id / historical:id). Null for real user submissions.';
