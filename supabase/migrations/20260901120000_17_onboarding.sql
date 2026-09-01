-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 17 — Intelligence onboarding
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Creating an organisation takes four fields and thirty seconds. What the
-- platform needs in order to say anything useful about a business takes rather
-- more: its shape, what it is trying to achieve, which systems hold its
-- numbers, and who it competes with. Until now none of that was ever asked,
-- so a new customer arrived at a Command Centre with nothing in it and no path
-- from there to something worth looking at.
--
-- Seven steps ask for it. This migration is what makes them resumable.
--
-- ── why a record and not a wizard ─────────────────────────────────────────
-- The obvious implementation keeps the answers in the browser until the last
-- step and writes everything at the end. That fails the way real onboarding
-- actually goes: it is done over several sittings, by more than one person,
-- and half of it is delegated ("ask the accountant which system that is").
-- Anything held client-side is lost by then.
--
-- So each step writes as it is answered, to the real tables — a branch entered
-- in step two is a branch, not a draft — and this record tracks only which
-- steps have been answered, which were skipped, and where to resume.

create table public.onboarding_progress (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,

  -- Where "continue" goes.
  current_step    text not null default 'identity',
  completed_steps text[] not null default '{}',
  -- Skipping is a first-class answer, not an absence of one. A business with
  -- one site should not be made to invent a structure, and the review step has
  -- to be able to tell "not applicable" from "not yet done".
  skipped_steps   text[] not null default '{}',

  -- What was said that has no table of its own — how the business describes
  -- itself, roughly how large it is, which of its systems are on paper. Kept
  -- as a document because the questions will change and a column per question
  -- would mean a migration each time somebody rewords one.
  answers         jsonb not null default '{}'::jsonb,

  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  -- When the twin was first built from the answers. Separate from completion:
  -- somebody can finish the questions and not press the button.
  initialised_at  timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A misspelled step would otherwise sit in the array for ever, never
  -- matching, and the customer would be asked the same question at every
  -- sitting with no error anywhere to explain it.
  constraint steps_are_known check (
    current_step = any (array['identity','structure','objectives','systems','data','market','review'])
    and completed_steps <@ array['identity','structure','objectives','systems','data','market','review']
    and skipped_steps   <@ array['identity','structure','objectives','systems','data','market','review']
  ),
  -- A step cannot be both answered and skipped. Without this the review page
  -- has two contradictory sources for the same question.
  constraint not_both_done_and_skipped check (
    not (completed_steps && skipped_steps)
  )
);

comment on table public.onboarding_progress is
  'Which of the seven onboarding steps an organisation has answered, skipped, and where to resume. The answers themselves go to the real tables; only what has no table of its own is kept here.';

create trigger onboarding_progress_touch
  before update on public.onboarding_progress
  for each row execute function amryn.touch_updated_at();

alter table public.onboarding_progress enable row level security;
alter table public.onboarding_progress force row level security;

-- Every member can see how far setup has got — a colleague who lands on a half
-- empty Command Centre deserves to know why rather than assume it is broken.
create policy onboarding_progress_read on public.onboarding_progress
  for select to authenticated
  using (amryn.is_member(organisation_id));

create policy onboarding_progress_write on public.onboarding_progress
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'manage_organisation'))
  with check (amryn.has_permission(organisation_id, 'manage_organisation'));

-- ── the guard from migration 16 does not reach this table ─────────────────
--
-- refuse_lapsed_write() was attached by iterating the catalogue at the moment
-- migration 16 ran. That is a snapshot, and this table did not exist yet — so
-- it carries no trigger, and neither will anything added after it unless
-- somebody remembers.
--
-- Here that is the right answer and is stated rather than inherited: setting
-- up is how a trial becomes a customer, and an organisation whose trial ran
-- out mid-onboarding must be able to finish and then pay. Test 19 asserts that
-- every other table with an organisation_id either carries the guard or is on
-- the exemption list, so the next table added is a failing test rather than a
-- silent gap.

-- ── opening the record ────────────────────────────────────────────────────
--
-- Definer, because the first caller is the person who has just created the
-- organisation and the row has to exist before anything can be saved against
-- it. Idempotent, so a refresh or a second tab costs nothing.
create or replace function public.ensure_onboarding(p_organisation uuid)
returns public.onboarding_progress
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.onboarding_progress;
begin
  if not amryn.is_member(p_organisation) then
    raise exception 'not a member of that organisation' using errcode = '42501';
  end if;

  insert into public.onboarding_progress (organisation_id)
  values (p_organisation)
  on conflict (organisation_id) do nothing;

  select * into result from public.onboarding_progress
   where organisation_id = p_organisation;

  return result;
end $$;

-- ── finishing ─────────────────────────────────────────────────────────────
--
-- One statement, so that "the questions are answered" and "the twin has been
-- built" cannot disagree, and so the audit entry is written in the same
-- transaction as the thing it records.
create or replace function public.complete_onboarding(p_organisation uuid)
returns public.onboarding_progress
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.onboarding_progress;
begin
  if not amryn.has_permission(p_organisation, 'manage_organisation') then
    raise exception 'only an administrator can finish setting up' using errcode = '42501';
  end if;

  update public.onboarding_progress
     set completed_at   = coalesce(completed_at, now()),
         initialised_at = coalesce(initialised_at, now()),
         current_step   = 'review'
   where organisation_id = p_organisation
  returning * into result;

  if not found then
    raise exception 'that organisation has not started setting up' using errcode = 'P0002';
  end if;

  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values
    (p_organisation, auth.uid(), 'onboarding.completed', 'organisation',
     p_organisation::text, 'Setup finished and the twin initialised');

  return result;
end $$;

notify pgrst, 'reload schema';
