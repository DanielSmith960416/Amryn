-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 11 — Invitations
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now every person who signed up got an organisation of their own, and
-- there was no way into anyone else's. The members screen already rendered an
-- `invited` status and nothing ever wrote one.
--
-- The obvious implementation does not work: organisation_members.user_id
-- references auth.users and is not null, so a membership cannot exist for
-- somebody who has not signed up yet — which is exactly who an invitation is
-- for. So an invitation is its own record, and becomes a membership when it is
-- accepted.
--
-- The link is the credential, so it is treated as one. Only a SHA-256 hash of
-- the token is stored: the database never holds anything that grants access,
-- and a leaked backup does not let anyone in. The raw token exists once, in the
-- response that creates it, and is shown to the person who will send it on.

create table public.organisation_invitations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- citext, so an invitation to Someone@Example.com is accepted by
  -- someone@example.com. Case-sensitivity here would be a support burden and
  -- protects nothing.
  email           citext not null,
  role            public.org_role not null default 'viewer',
  scope_kind      public.scope_kind not null default 'organisation',
  scope_ids       uuid[] not null default '{}',
  -- Never the token itself.
  token_hash      text not null unique,
  invited_by      uuid references auth.users (id) on delete set null,
  expires_at      timestamptz not null default now() + interval '14 days',
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users (id) on delete set null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint scope_ids_match_kind check (
    (scope_kind = 'organisation' and cardinality(scope_ids) = 0)
    or (scope_kind <> 'organisation' and cardinality(scope_ids) > 0)
  ),
  -- An invitation is either open, accepted or revoked. Recording both an
  -- acceptance and a revocation would leave no answer to "did they get in".
  constraint not_both_accepted_and_revoked check (
    accepted_at is null or revoked_at is null
  )
);

-- One open invitation per address per organisation. A partial index rather than
-- a plain unique constraint, so the same person can be re-invited after an
-- invitation is revoked or expires.
create unique index organisation_invitations_open_email
  on public.organisation_invitations (organisation_id, email)
  where accepted_at is null and revoked_at is null;

create index organisation_invitations_org on public.organisation_invitations (organisation_id);

create trigger organisation_invitations_touch
  before update on public.organisation_invitations
  for each row execute function amryn.touch_updated_at();

-- ── who may see and write them ────────────────────────────────────────────
alter table public.organisation_invitations enable row level security;
alter table public.organisation_invitations force row level security;

-- Reading an invitation reveals who is being brought into the business, so it
-- is limited to the people who manage members — not every colleague.
create policy organisation_invitations_read on public.organisation_invitations
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'manage_users'));

create policy organisation_invitations_write on public.organisation_invitations
  for insert to authenticated
  with check (amryn.has_permission(organisation_id, 'manage_users'));

-- Update covers revoking. Acceptance does not come through here: the invitee
-- is not a member yet and no policy would let them touch the row, which is why
-- accept_invitation() runs as its owner.
create policy organisation_invitations_update on public.organisation_invitations
  for update to authenticated
  using (amryn.has_permission(organisation_id, 'manage_users'))
  with check (amryn.has_permission(organisation_id, 'manage_users'));

grant select, insert, update on public.organisation_invitations to authenticated;

-- ── looking at an invitation before accepting it ──────────────────────────
--
-- The invitee cannot read the row — they are not a member of anything yet — so
-- this reads it for them and returns only what the page needs to say: which
-- organisation, which role, and whether the link is still good. Not who else
-- is invited, and not the token.
--
-- Takes the raw token, so possession of the link is the whole authorisation.
create or replace function public.invitation_preview(p_token text)
returns table (
  organisation_name text,
  role              public.org_role,
  email             text,
  state             text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hashed text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  -- Not named `found`: that is PL/pgSQL's own boolean, and shadowing it makes
  -- `if not found` a type error rather than the check it looks like.
  invite record;
begin
  select i.*, o.name as org_name
    into invite
    from public.organisation_invitations i
    join public.organisations o on o.id = i.organisation_id
   where i.token_hash = hashed;

  if invite.id is null then
    -- Deliberately indistinguishable from an expired one on the caller's side:
    -- a separate "no such invitation" would make this a way to test tokens.
    return query select null::text, null::public.org_role, null::text, 'invalid'::text;
    return;
  end if;

  return query select
    invite.org_name::text,
    invite.role,
    invite.email::text,
    case
      when invite.revoked_at is not null then 'revoked'
      when invite.accepted_at is not null then 'accepted'
      when invite.expires_at <= now() then 'expired'
      else 'open'
    end;
end;
$$;

revoke all on function public.invitation_preview(text) from public;
-- anon may call it: someone following an invitation link has usually not
-- signed in yet, and being told what they are being invited to is the point.
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ── accepting ─────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER because the caller is, by definition, not yet a member of
-- the organisation whose membership row is about to be written — the same
-- reason create_organisation() runs this way.
--
-- The membership is created with the role and scope recorded on the
-- invitation, never with anything the caller sends. There is no parameter here
-- but the token.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid        uuid := auth.uid();
  user_email citext;
  invite     public.organisation_invitations;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.email into user_email from auth.users u where u.id = uid;

  select * into invite
    from public.organisation_invitations
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     for update;

  if not found then
    raise exception 'this invitation link is not valid' using errcode = '22023';
  end if;

  if invite.revoked_at is not null then
    raise exception 'this invitation has been withdrawn' using errcode = '22023';
  end if;

  if invite.expires_at <= now() then
    raise exception 'this invitation has expired' using errcode = '22023';
  end if;

  -- Bound to the address it was sent to. Holding the link is not enough:
  -- a forwarded invitation would otherwise hand a stranger access to the
  -- company's data under someone else's name.
  if user_email is null or user_email <> invite.email then
    raise exception 'this invitation was sent to a different email address'
      using errcode = '42501';
  end if;

  -- Already accepted is only an error if somebody else accepted it. For the
  -- same person it is a repeated click, and the answer is where they were
  -- going anyway.
  if invite.accepted_at is not null then
    if invite.accepted_by = uid then
      return invite.organisation_id;
    end if;
    raise exception 'this invitation has already been used' using errcode = '22023';
  end if;

  insert into public.organisation_members
    (organisation_id, user_id, role, status, scope_kind, scope_ids, invited_by, invited_at)
  values
    (invite.organisation_id, uid, invite.role, 'active', invite.scope_kind,
     invite.scope_ids, invite.invited_by, invite.created_at)
  on conflict (organisation_id, user_id) do update
    set status = 'active';

  update public.organisation_invitations
     set accepted_at = now(), accepted_by = uid
   where id = invite.id;

  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values
    (invite.organisation_id, uid, 'member.joined', 'organisation_member', uid::text,
     invite.email || ' accepted an invitation as ' || invite.role);

  return invite.organisation_id;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

notify pgrst, 'reload schema';
