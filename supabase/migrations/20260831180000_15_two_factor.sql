-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 15 — Two-factor authentication
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now a stolen password was the whole attack. For a platform holding a
-- company's financial records, customer list and pipeline, that is the largest
-- single gap in the product.
--
-- Supabase issues and verifies the second factor itself, so none of the TOTP
-- machinery lives here. What lives here is the part an application must not
-- get wrong: making the requirement real.
--
-- ── why this is not only an application check ─────────────────────────────
-- The obvious implementation is a redirect: if the session has not completed
-- the challenge, send it to the verify page. That is worth doing and is not
-- enough. Every browser session also carries a key that speaks to PostgREST
-- directly, and a session that skipped the challenge is a perfectly valid
-- session as far as the database is concerned — so anyone willing to use the
-- API instead of the interface would read everything the redirect was hiding.
-- A second factor that can be walked around with curl is a checkbox, not a
-- control.
--
-- So the requirement is enforced where the data is. Supabase records the
-- authenticator assurance level in the token as `aal`: aal1 is a password,
-- aal2 is a password and a second factor. Every policy in this schema already
-- reaches the caller through amryn.is_member() or amryn.has_permission(), so
-- adding the condition to those two puts it in front of all 147 of them.

-- ── who has it turned on ──────────────────────────────────────────────────
--
-- Kept here rather than read from auth.mfa_factors, which belongs to another
-- role and may not be readable from this schema on every project. A guard that
-- cannot read its own input has to choose between failing open — which is not
-- a guard — and locking every customer out of their data over a missing grant.
-- This is our own table, and the application writes it in the same action that
-- verifies the factor.
alter table public.user_profiles
  add column mfa_enabled boolean not null default false,
  add column mfa_enabled_at timestamptz;

comment on column public.user_profiles.mfa_enabled is
  'Whether this person has a verified second factor. Set when enrolment is confirmed, cleared when the last factor is removed. The database refuses their data to a session that has not presented it.';

-- ── the guard ─────────────────────────────────────────────────────────────
create or replace function amryn.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- Presented the second factor on this session.
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    -- Or has none to present. Someone who has not turned it on is not asked
    -- for it, and neither is a background job, which carries no token at all:
    -- auth.uid() is null there, the row is not found, and the answer is true.
    or not exists (
      select 1
      from public.user_profiles p
      where p.id = auth.uid()
        and p.mfa_enabled
    );
$$;

comment on function amryn.mfa_satisfied is
  'False only for a session belonging to someone with two-factor turned on that has not completed the second step. Used by is_member() and has_permission(), so it applies to every policy without repeating it in each.';

-- ── applied to the two functions every policy goes through ────────────────
--
-- Deliberately not added to the policies one at a time. There are 147 of them;
-- a condition repeated 147 times is a condition that will be missing from the
-- 148th.

create or replace function amryn.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select amryn.mfa_satisfied() and exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function amryn.has_permission(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with member as (
    select m.id, m.role
    from public.organisation_members m
    where m.organisation_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
    limit 1
  ),
  override as (
    select o.granted
    from public.member_permission_overrides o
    join member on member.id = o.member_id
    where o.permission_key = p_permission
    limit 1
  ),
  role_default as (
    select true as granted
    from public.role_permissions rp
    join member on member.role = rp.role
    where rp.permission_key = p_permission
    limit 1
  )
  select amryn.mfa_satisfied() and coalesce(
    (select granted from override),
    (select granted from role_default),
    false
  );
$$;

-- member_role() is deliberately left alone. It answers "what is this person's
-- role", which the interface needs in order to render the page that explains
-- they must complete the second step — and it returns a label, never data.

-- ── recovery codes ────────────────────────────────────────────────────────
--
-- The failure mode of two-factor authentication is not an attacker; it is a
-- lost phone. Without a way back, turning it on is a way to lose an account,
-- and the people most likely to turn it on are the ones with the most to lose.
--
-- Ten single-use codes, stored as SHA-256 hashes for the same reason passwords
-- are: a database that can produce the codes is a database that can bypass the
-- factor. Redeeming one is not a sign-in — it removes the factor, and the
-- person is asked to enrol again. So the two things needed to get back in are
-- the password and a code, which is still two factors.

create table public.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create index mfa_recovery_codes_user on public.mfa_recovery_codes (user_id)
  where used_at is null;

alter table public.mfa_recovery_codes enable row level security;

-- No force: the definer functions below are the only writers, exactly as with
-- audit_logs. See migration 14 for why forcing it would refuse them too.

-- A person may see that they have codes, and how many are left. The hash is
-- readable in the sense that any column of a visible row is, which is why it
-- is a hash: reading it yields nothing usable. Nobody sees anybody else's.
create policy mfa_recovery_read_own on public.mfa_recovery_codes
  for select to authenticated
  using (user_id = auth.uid());

-- No insert, update or delete policy at all. Codes are issued and spent by the
-- functions below, so a caller cannot mint themselves a code, and cannot
-- un-spend one.
grant select on public.mfa_recovery_codes to authenticated;
revoke insert, update, delete on public.mfa_recovery_codes from authenticated, anon;

/**
 * Replaces this person's recovery codes with the ones given.
 *
 * Takes hashes, never codes: the plaintext is generated in the application,
 * shown once, and never sent to the database. Replacing rather than adding,
 * because a fresh set has to invalidate the old one — otherwise a code from a
 * printout two years ago still works.
 */
create or replace function public.replace_recovery_codes(p_hashes text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if array_length(p_hashes, 1) is null or array_length(p_hashes, 1) > 20 then
    raise exception 'expected between 1 and 20 recovery codes' using errcode = '22023';
  end if;

  delete from public.mfa_recovery_codes where user_id = uid;

  insert into public.mfa_recovery_codes (user_id, code_hash)
  select uid, hash from unnest(p_hashes) as hash;
end;
$$;

revoke all on function public.replace_recovery_codes(text[]) from public, anon;
grant execute on function public.replace_recovery_codes(text[]) to authenticated;

/**
 * Spends a recovery code, if it is one of this person's unused ones.
 *
 * Returns whether it was accepted. The update is the check — a single
 * statement that matches only an unused code and marks it used in the same
 * breath, so two simultaneous attempts with the same code cannot both succeed.
 */
create or replace function public.redeem_recovery_code(p_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  spent   uuid;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.mfa_recovery_codes
     set used_at = now()
   where user_id = uid
     and code_hash = p_hash
     and used_at is null
  returning id into spent;

  if spent is null then
    return false;
  end if;

  -- The code is spent and the factor is about to be removed by the caller,
  -- which holds the credentials to do it. Clearing the flag here keeps the
  -- two in step: a profile that still said mfa_enabled with no factor left
  -- would lock the account out of its own data with nothing able to satisfy
  -- the guard.
  update public.user_profiles
     set mfa_enabled = false, mfa_enabled_at = null
   where id = uid;

  return true;
end;
$$;

revoke all on function public.redeem_recovery_code(text) from public, anon;
grant execute on function public.redeem_recovery_code(text) to authenticated;

notify pgrst, 'reload schema';
