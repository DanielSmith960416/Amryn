-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 13 — Consent, and the right to ask what is held
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POPIA (Act 4 of 2013) requires that processing rest on a lawful basis, that
-- the data subject be able to establish what is held about them, and that they
-- can ask for it to be corrected or destroyed. Two things follow that the
-- schema did not have.
--
-- ── consent, with a date ──────────────────────────────────────────────────
-- "They accepted the terms" is not a fact unless it is written down. The
-- version matters as much as the timestamp: terms change, and consent to one
-- wording is not consent to a later one, so both are recorded and a change of
-- version is visible as an absence rather than assumed away.

alter table public.user_profiles
  add column terms_accepted_at timestamptz,
  add column terms_version     text,
  add column privacy_accepted_at timestamptz,
  add column privacy_version   text;

comment on column public.user_profiles.terms_accepted_at is
  'When this person accepted the terms of service. Null means they have not.';
comment on column public.user_profiles.terms_version is
  'Which wording they accepted. Consent to one version is not consent to the next.';

-- An organisation is a separate consenting party: its administrator agrees to
-- the data processing addendum on the organisation''s behalf, which is a
-- different act from that person accepting the terms as an individual.
alter table public.organisations
  add column dpa_accepted_at timestamptz,
  add column dpa_version     text,
  add column dpa_accepted_by uuid references auth.users (id) on delete set null;

comment on column public.organisations.dpa_accepted_at is
  'When an administrator accepted the data processing addendum for this organisation.';

-- ── the right to ask ──────────────────────────────────────────────────────
--
-- A request is recorded rather than acted on immediately. Export and erasure
-- both need judgement — an organisation''s records are not one member''s to
-- delete, and a request from an administrator may implicate colleagues — so
-- this creates an auditable obligation with a clock on it, which is what the
-- Act actually asks for.

create type public.data_request_kind as enum ('export', 'deletion', 'correction');
create type public.data_request_status as enum ('received', 'in_progress', 'completed', 'refused');

create table public.data_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           public.data_request_kind not null,
  status         public.data_request_status not null default 'received',
  -- What the person said, in their words. Useful for a correction request,
  -- where the substance is the point.
  note           text check (note is null or length(note) <= 2000),
  -- What was done, for the audit trail. Never shown to the requester as-is.
  resolution     text,
  requested_at   timestamptz not null default now(),
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index data_requests_user on public.data_requests (user_id);
create index data_requests_open on public.data_requests (status) where status in ('received', 'in_progress');

create trigger data_requests_touch
  before update on public.data_requests
  for each row execute function amryn.touch_updated_at();

alter table public.data_requests enable row level security;
alter table public.data_requests force row level security;

-- A person may see and make their own requests, and nobody else''s. There is
-- deliberately no policy letting an organisation administrator read these: a
-- request to exercise a personal right is between the individual and the
-- responsible party, and an employer reading it would chill the exercise of it.
create policy data_requests_read_own on public.data_requests
  for select to authenticated
  using (user_id = auth.uid());

create policy data_requests_create_own on public.data_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- No update or delete policy at all. A request cannot be withdrawn by editing
-- it away, and its status is set by whoever handles it, outside this interface.

grant select, insert on public.data_requests to authenticated;

-- ── carrying consent through sign-up ──────────────────────────────────────
--
-- Consent is given on the sign-up form, but the profile row it belongs on may
-- not exist yet: where the project confirms addresses by email, the account is
-- created and the person disappears into their inbox for a while, and where
-- the trigger below could not be installed the profile is not written until
-- their first sign-in. Recording the acceptance in the account's own metadata
-- at the moment it is given, and copying it onto the profile whichever path
-- creates that profile, is what makes the record survive both gaps.
--
-- Both writers use coalesce on the existing timestamp, so a later acceptance
-- of a newer version is never overwritten by the one captured at sign-up.

create or replace function amryn.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles (
    id, email, full_name, avatar_url,
    terms_accepted_at, terms_version, privacy_accepted_at, privacy_version
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    new.raw_user_meta_data ->> 'terms_version',
    (new.raw_user_meta_data ->> 'privacy_accepted_at')::timestamptz,
    new.raw_user_meta_data ->> 'privacy_version'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
        terms_accepted_at = coalesce(public.user_profiles.terms_accepted_at, excluded.terms_accepted_at),
        terms_version = coalesce(public.user_profiles.terms_version, excluded.terms_version),
        privacy_accepted_at = coalesce(public.user_profiles.privacy_accepted_at, excluded.privacy_accepted_at),
        privacy_version = coalesce(public.user_profiles.privacy_version, excluded.privacy_version);
  return new;
end;
$$;

create or replace function public.ensure_user_profile()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  insert into public.user_profiles (
    id, email, full_name, avatar_url,
    terms_accepted_at, terms_version, privacy_accepted_at, privacy_version
  )
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    u.raw_user_meta_data ->> 'avatar_url',
    (u.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    u.raw_user_meta_data ->> 'terms_version',
    (u.raw_user_meta_data ->> 'privacy_accepted_at')::timestamptz,
    u.raw_user_meta_data ->> 'privacy_version'
  from auth.users u
  where u.id = uid
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
        terms_accepted_at = coalesce(public.user_profiles.terms_accepted_at, excluded.terms_accepted_at),
        terms_version = coalesce(public.user_profiles.terms_version, excluded.terms_version),
        privacy_accepted_at = coalesce(public.user_profiles.privacy_accepted_at, excluded.privacy_accepted_at),
        privacy_version = coalesce(public.user_profiles.privacy_version, excluded.privacy_version);
end;
$$;

revoke all on function public.ensure_user_profile() from public, anon;
grant execute on function public.ensure_user_profile() to authenticated;

notify pgrst, 'reload schema';
