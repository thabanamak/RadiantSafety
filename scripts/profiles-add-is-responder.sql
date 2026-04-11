-- Add first-responder verification flag to profiles (run in Supabase SQL Editor if missing).
alter table public.profiles
  add column if not exists is_responder boolean not null default false;

comment on column public.profiles.is_responder is 'Set by the app after ID verification; first responder badge.';
