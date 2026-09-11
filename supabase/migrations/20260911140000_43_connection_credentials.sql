-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 43 — where a customer's connection credential actually lives
--
-- data_connections has carried this comment since migration 02:
--
--     Non-secret connection shape only. Credentials live in the secret
--     manager and are referenced by handle, never stored in the tenant
--     database.
--
-- Until now there was no secret manager, so credential_ref pointed at nothing
-- and no connector could hold a key. This migration names the secret manager:
-- Supabase Vault, already installed on this project (supabase_vault 0.3.1),
-- which stores secrets encrypted outside the tenant tables and hands back a
-- uuid. That uuid is exactly what credential_ref was designed to hold — opaque
-- to Amryn, meaningful only to whatever issued it.
--
-- ── why Vault rather than a column ───────────────────────────────────────
--
-- A Paystack secret key is not a read-only credential. The same key that
-- lists transactions can initialise one, charge a stored authorisation and
-- take a partial debit. Paystack offers no narrower scope, so the key a
-- customer hands over can move their money, and it must not sit in a column
-- that a backup dump, a support query or a mis-scoped select would reveal.
--
-- vault.secrets is readable only by supabase_admin, postgres and service_role.
-- anon and authenticated have no grant on it at all — checked on this database
-- rather than assumed — so a signed-in customer's own session can never read
-- one, their own included.
--
-- ── what this migration does NOT claim ───────────────────────────────────
--
-- Anything holding the service role key can already read every secret in the
-- Vault directly. The reader below adds no exposure that did not exist; it
-- adds a narrow, named, auditable door in place of a broad one, and it is
-- granted to service_role alone so that the web application — which runs as
-- the signed-in user — cannot open it even by mistake.
--
-- Additive only: two new functions, one new index, no table altered, no column
-- dropped, no existing row touched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── storing one ──────────────────────────────────────────────────────────
--
-- Called by the application as the signed-in person, which is why it is
-- security definer and checks the permission itself: the caller may not write
-- credential_ref directly, and RLS on data_connections is not enough on its
-- own because the Vault write happens in a schema the caller cannot reach.
--
-- The secret is a parameter and never appears in a raise, a return value or a
-- summary. plpgsql does not log parameters, and nothing here puts it anywhere
-- that would.
create or replace function public.store_connection_credential(
  p_connection uuid,
  p_secret     text
)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_org      uuid;
  v_existing text;
  v_id       uuid;
begin
  if p_secret is null or btrim(p_secret) = '' then
    raise exception 'a connection credential cannot be blank' using errcode = '22023';
  end if;

  -- The connection decides the organisation, not the caller. Taking it as a
  -- parameter would let a well-formed call name an organisation it does not
  -- belong to and have the permission check pass against that one instead.
  select organisation_id, credential_ref
    into v_org, v_existing
    from public.data_connections
   where id = p_connection;

  if v_org is null then
    raise exception 'that connection does not exist' using errcode = 'P0002';
  end if;

  if not amryn.has_permission(v_org, 'manage_integrations') then
    raise exception 'you do not have permission to change that connection'
      using errcode = '42501';
  end if;

  if v_existing is not null then
    -- Replacing a rotated key. Updating in place rather than creating a second
    -- secret and repointing: the old one would otherwise stay in the Vault
    -- for ever, holding a live credential nobody can see and nobody deletes.
    perform vault.update_secret(v_existing::uuid, btrim(p_secret));
    v_id := v_existing::uuid;
  else
    v_id := vault.create_secret(
      btrim(p_secret),
      -- Unique per connection, so a second store for the same connection
      -- cannot silently create a duplicate under a colliding name.
      'connection:' || p_connection::text,
      'Credential for an Amryn data connection. Never returned to the browser.',
      null
    );

    update public.data_connections
       set credential_ref = v_id::text,
           updated_at     = now()
     where id = p_connection;
  end if;

  -- Audited, because handing a payment credential to software is a thing
  -- somebody should be able to see happened, and when. The secret is not in
  -- the summary; the fact of it is.
  insert into public.audit_logs
    (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values
    (v_org, auth.uid(), 'connection.credential_stored', 'data_connection',
     p_connection::text,
     case when v_existing is null then 'Credential stored' else 'Credential replaced' end);

  return v_id::text;
end;
$$;

revoke all on function public.store_connection_credential(uuid, text) from public, anon;
grant execute on function public.store_connection_credential(uuid, text) to authenticated;

-- ── forgetting one ───────────────────────────────────────────────────────
--
-- Deliberately quiet when there is nothing to forget. A customer disconnecting
-- an account whose key they have already revoked at the provider's end is
-- doing the right thing in the wrong order and should not meet an error for
-- it — the same contract ConnectorProvider.revoke() states in TypeScript.
create or replace function public.forget_connection_credential(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_org uuid;
  v_ref text;
begin
  select organisation_id, credential_ref
    into v_org, v_ref
    from public.data_connections
   where id = p_connection;

  if v_org is null then
    return;
  end if;

  if not amryn.has_permission(v_org, 'manage_integrations') then
    raise exception 'you do not have permission to change that connection'
      using errcode = '42501';
  end if;

  if v_ref is not null then
    delete from vault.secrets where id = v_ref::uuid;

    update public.data_connections
       set credential_ref = null,
           updated_at     = now()
     where id = p_connection;

    insert into public.audit_logs
      (organisation_id, actor_id, action, entity_type, entity_id, summary)
    values
      (v_org, auth.uid(), 'connection.credential_forgotten', 'data_connection',
       p_connection::text, 'Credential deleted');
  end if;
end;
$$;

revoke all on function public.forget_connection_credential(uuid) from public, anon;
grant execute on function public.forget_connection_credential(uuid) to authenticated;

-- ── reading one ──────────────────────────────────────────────────────────
--
-- The only function in this database that returns a decrypted credential, and
-- the grants below are the whole point of it.
--
-- service_role only. Not authenticated, not anon, not public. The web
-- application runs as the signed-in person and therefore cannot call this at
-- all; the worker runs as service_role and can. That is the line: a customer's
-- payment key is reachable by the process that syncs it and by nothing that
-- renders a page.
--
-- No audit row. This runs once per sync per connection and would bury the
-- audit log in noise that says nothing a sync record does not already say.
create or replace function public.connection_credential(p_connection uuid)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_ref    text;
  v_secret text;
begin
  select credential_ref into v_ref
    from public.data_connections
   where id = p_connection;

  if v_ref is null then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where id = v_ref::uuid;

  return v_secret;
end;
$$;

revoke all on function public.connection_credential(uuid) from public, anon, authenticated;
grant execute on function public.connection_credential(uuid) to service_role;

-- Sync resolves a connection by its credential handle often enough to be worth
-- an index, and a partial one because most rows never hold a credential.
create index if not exists data_connections_credential_ref_idx
  on public.data_connections (credential_ref)
  where credential_ref is not null;
