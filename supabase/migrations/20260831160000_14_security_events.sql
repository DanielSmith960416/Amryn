-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 14 — Security events that can be trusted
-- ═══════════════════════════════════════════════════════════════════════════
--
-- audit_logs has existed since migration 01 and had one writer: a change of
-- radar sector scope. Everything a security log exists for — who signed in,
-- who was invited, who joined, who took a copy of their own information — went
-- unrecorded, which made the privacy policy's promise that "sign-ins and
-- organisation changes are recorded" a sentence about something that was not
-- happening.
--
-- ── and the writes it did allow were not evidence ─────────────────────────
-- The insert policy was:
--
--   with check (organisation_id is null or amryn.is_member(organisation_id))
--
-- Any member could write any row: an action of their choosing, a summary of
-- their choosing, and — because actor_id was supplied by the caller — somebody
-- else's name on it. A log a subject can forge is not an audit log; it is a
-- table with an official-sounding name, and relying on it in an investigation
-- would be worse than having none.
--
-- So the row is written by a function that decides the two fields that matter,
-- and the direct insert is withdrawn.

create or replace function public.record_security_event(
  p_organisation_id uuid,
  p_action          text,
  p_entity_type     text default 'account',
  p_entity_id       text default null,
  p_summary         text default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  -- The actor is never taken from the caller. This is the whole point.
  if p_organisation_id is not null and not amryn.is_member(p_organisation_id) then
    raise exception 'not a member of that organisation' using errcode = '42501';
  end if;

  insert into public.audit_logs (
    organisation_id, actor_id, action, entity_type, entity_id, summary, metadata
  )
  values (
    p_organisation_id, uid, p_action, coalesce(p_entity_type, 'account'),
    p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

comment on function public.record_security_event is
  'The only way the application writes an audit row. Sets actor_id from the session, so an entry cannot be attributed to somebody else.';

revoke all on function public.record_security_event(uuid, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.record_security_event(uuid, text, text, text, text, jsonb)
  to authenticated;

-- A sign-in has no organisation yet, and the person may belong to none. That
-- row is ours as responsible party rather than any employer's, which is also
-- why the read policy below leaves it invisible to organisation administrators.
create or replace function public.record_account_event(
  p_action  text,
  p_summary text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (organisation_id, actor_id, action, entity_type, summary)
  values (null, auth.uid(), p_action, 'account', p_summary);
end;
$$;

revoke all on function public.record_account_event(text, text) from public, anon;
-- anon may call this one: a failed sign-in has no session, and a log that
-- records only the attempts that succeeded is not a security log. The function
-- writes auth.uid(), which is null in that case, so an anonymous caller cannot
-- attribute an entry to anybody.
grant execute on function public.record_account_event(text, text) to authenticated, anon;

-- ── withdraw the forgeable path ──────────────────────────────────────────
--
-- Two changes, and the second is the one that makes the first survivable.
--
-- Dropping the policy is what removes the forgeable write. But audit_logs
-- carries FORCE row level security, which applies to the table's owner too —
-- and with no insert policy left, "everyone" includes the owner. Every
-- SECURITY DEFINER function that writes an audit row runs as that owner:
-- the two below, and create_organisation(), whose last statement records
-- 'organisation.created'. An error inside a function rolls the whole call
-- back, so dropping the policy alone would have broken organisation creation
-- outright — on the onboarding form, for every new customer.
--
-- On a local PostgreSQL this is invisible: there the owner is a superuser, and
-- a superuser bypasses row level security whether or not it is forced. On a
-- hosted Supabase project the postgres role is not a superuser, so it is
-- subject to the policies like anyone else. This is the third time that
-- difference has hidden a fault from the test suite; supabase/tests/17 now
-- reproduces it deliberately.
--
-- Lifting FORCE is the correct answer rather than a workaround. What must be
-- true of an append-only log is that the application cannot write to it
-- directly and can only read its own organisation's rows — and both survive:
-- the revoke below removes the write privilege from authenticated entirely,
-- which is a stronger guarantee than a policy, and audit_read still governs
-- every read, because a caller is never the owner. The only writers left are
-- the definer functions, which is what "the only way the application writes an
-- audit row" was meant to mean.
alter table public.audit_logs no force row level security;

drop policy if exists audit_append on public.audit_logs;
revoke insert, update, delete on public.audit_logs from authenticated, anon;

-- Reading is unchanged and deliberately narrow: an organisation administrator
-- with view_audit_log sees their own organisation's entries. Account-level
-- rows carry no organisation_id and so match no policy at all — nobody reads
-- those through the API, which is correct for a record of an individual's
-- sign-ins held by us rather than by their employer.

notify pgrst, 'reload schema';
