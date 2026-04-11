-- ============================================================================
-- Fresh `public.user_reports` — run in Supabase SQL Editor (replaces old table).
-- trust = 10 + upvotes - downvotes; trust_label: Trustworthy / Semi-trustworthy /
-- Medium trust / Untrustworthy; severity from category; delete row if trust < 0.
-- ============================================================================

drop table if exists public.user_reports cascade;

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  description text not null default '',
  image_url text,
  category text not null,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reports_category_allowed check (
    category in (
      'Gang Activity',
      'Unsafe Vibe',
      'Poor Lighting',
      'Theft',
      'Harassment',
      'Suspicious Activity',
      'Vandalism',
      'Drug Activity'
    )
  ),
  constraint user_reports_upvotes_nonnegative check (upvotes >= 0),
  constraint user_reports_downvotes_nonnegative check (downvotes >= 0),
  severity smallint not null generated always as (
    case category
      when 'Gang Activity' then 10
      when 'Harassment' then 9
      when 'Poor Lighting' then 8
      when 'Drug Activity' then 8
      when 'Unsafe Vibe' then 7
      when 'Theft' then 7
      when 'Vandalism' then 6
      when 'Suspicious Activity' then 5
      else 5
    end
  ) stored,
  trust integer not null generated always as (10 + upvotes - downvotes) stored,
  trust_label text not null generated always as (
    case
      when (10 + upvotes - downvotes) >= 20 then 'Trustworthy'
      when (10 + upvotes - downvotes) >= 15 then 'Semi-trustworthy'
      when (10 + upvotes - downvotes) >= 6 then 'Medium trust'
      else 'Untrustworthy'
    end
  ) stored
);

create index user_reports_location_idx on public.user_reports (latitude, longitude);
create index user_reports_user_idx on public.user_reports (user_id);

comment on table public.user_reports is 'Community reports; trust = 10+up−down; severity from category.';
comment on column public.user_reports.trust is 'Generated; row removed by trigger if < 0.';
comment on column public.user_reports.trust_label is 'Trustworthy ≥20; Semi-trustworthy 15–19; Medium trust 6–14; else Untrustworthy.';

create or replace function public.user_reports_delete_if_negative_trust()
returns trigger
language plpgsql
as $$
begin
  if (10 + new.upvotes - new.downvotes) < 0 then
    delete from public.user_reports where id = new.id;
    return null;
  end if;
  return new;
end;
$$;

create trigger user_reports_negative_trust_after
  after insert or update of upvotes, downvotes
  on public.user_reports
  for each row
  when (10 + new.upvotes - new.downvotes < 0)
  execute function public.user_reports_delete_if_negative_trust();

alter table public.user_reports enable row level security;

create policy "user_reports_select_authenticated"
  on public.user_reports for select to authenticated using (true);

create policy "user_reports_select_anon"
  on public.user_reports for select to anon using (true);

create policy "user_reports_insert_own"
  on public.user_reports for insert to authenticated
  with check (auth.uid() = user_id);

create policy "user_reports_update_own"
  on public.user_reports for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_reports_delete_own"
  on public.user_reports for delete to authenticated
  using (auth.uid() = user_id);
