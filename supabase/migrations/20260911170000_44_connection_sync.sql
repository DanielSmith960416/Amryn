-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 44 — reading a connected system, repeatedly, without duplicating
--
-- Migration 43 gave a credential somewhere to live. This gives what the
-- credential is for somewhere to land, and the whole of it is about the second
-- sync rather than the first.
--
-- ── the second sync is the hard one ──────────────────────────────────────
--
-- A first sync is a loop and an insert. A second one has to know which records
-- it already has, or every run doubles the customer's revenue. financial_records
-- has carried `reference` since migration 02, but reference is a customer's own
-- wording — an invoice number typed into a spreadsheet — and a gateway's
-- transaction id is a different kind of thing that happens to be text too.
-- Sharing one column between them would make a hand-typed reference collide
-- with a Paystack id, which is a data-loss bug that only appears in the
-- accounts that do both.
--
-- So: a separate `external_id`, unique per source, and null everywhere it does
-- not apply. Nothing existing is touched — the column arrives empty on every
-- row already stored, and the index ignores nulls, so the 1 row in this table
-- today and every file import after it carry on exactly as before.
--
-- ── where a sync stops, and where it starts again ────────────────────────
--
-- data_connection_syncs is one row per connection per kind of read. It holds
-- the cursor mid-walk and the watermark between runs, which are two different
-- things: a cursor is where this pass stopped, a watermark is how far back the
-- next pass needs to look. Keeping them apart is what lets a run interrupted
-- halfway resume rather than start again, and a completed run ask only for
-- what has changed.
--
-- One row per kind rather than per connection, because Amryn reads several
-- kinds from one system and they do not advance together: transactions may be
-- caught up while failed payments are three pages behind.
--
-- Additive: two nullable columns, one partial index, one new table.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.financial_records
  add column if not exists external_id text,
  -- Which connection brought it in. `set null` rather than cascade on purpose:
  -- disconnecting a system deletes Amryn's key and its connection row, and
  -- must not take the customer's figures with it. They were true when they
  -- arrived and they are still true.
  add column if not exists data_connection_id uuid
    references public.data_connections (id) on delete set null;

-- The constraint the second sync depends on. Partial, so the rows that predate
-- connectors — every row today, and every file import tomorrow — are untouched
-- by it.
create unique index if not exists financial_records_external_idx
  on public.financial_records (organisation_id, data_source_id, external_id)
  where external_id is not null;

create index if not exists financial_records_connection_idx
  on public.financial_records (data_connection_id)
  where data_connection_id is not null;

create table if not exists public.data_connection_syncs (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations (id) on delete cascade,
  data_connection_id uuid not null references public.data_connections (id) on delete cascade,
  -- One of the connector's intendedReads. Text rather than an enum because the
  -- list belongs to the catalogue in the application, and an enum here would
  -- mean a migration every time a connector learns to read one more thing.
  kind               text not null,
  -- Where this pass stopped. Opaque — it is the provider adapter's own string
  -- and nothing in SQL may interpret it.
  cursor             text,
  -- How far back the next pass needs to look. Null means "everything", which
  -- is what a first run wants.
  watermark          timestamptz,
  records_written    bigint not null default 0 check (records_written >= 0),
  last_run_at        timestamptz,
  -- The last failure, in the words a customer could be shown. Cleared by a run
  -- that succeeds, so a stale error cannot outlive the problem.
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (data_connection_id, kind)
);

create index if not exists data_connection_syncs_org_idx
  on public.data_connection_syncs (organisation_id, last_run_at desc);

create trigger data_connection_syncs_touch
  before update on public.data_connection_syncs
  for each row execute function amryn.touch_updated_at();

alter table public.data_connection_syncs enable row level security;
alter table public.data_connection_syncs force row level security;

-- The same pair migration 05 gives data_connections: seeing what a system is
-- doing is part of seeing the system; changing it is configuration.
create policy data_connection_syncs_read on public.data_connection_syncs
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'view_data_sources'));

create policy data_connection_syncs_insert on public.data_connection_syncs
  for insert to authenticated
  with check (amryn.has_permission(organisation_id, 'manage_integrations'));

create policy data_connection_syncs_update on public.data_connection_syncs
  for update to authenticated
  using (amryn.has_permission(organisation_id, 'manage_integrations'))
  with check (amryn.has_permission(organisation_id, 'manage_integrations'));

create policy data_connection_syncs_delete on public.data_connection_syncs
  for delete to authenticated
  using (amryn.has_permission(organisation_id, 'manage_integrations'));

-- ── asking for a sync ────────────────────────────────────────────────────
--
-- The same shape as request_document_ocr: the connection decides the
-- organisation, the permission is checked here rather than trusted from the
-- caller, and pressing the button twice is not a mistake worth an error.
create or replace function public.request_connection_sync(p_connection uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid;
  v_status public.connection_status;
  v_has    boolean;
  v_job    uuid;
begin
  select c.organisation_id, c.status, c.credential_ref is not null
    into v_org, v_status, v_has
    from public.data_connections c
   where c.id = p_connection;

  if v_org is null then
    raise exception 'that connection does not exist' using errcode = 'P0002';
  end if;

  -- Reading a connected system spends somebody's rate limit at the provider
  -- and writes to their records, so it takes the configuration permission
  -- rather than the viewing one.
  if not amryn.has_permission(v_org, 'manage_integrations') then
    raise exception 'you do not have permission to sync that connection'
      using errcode = '42501';
  end if;

  -- A connection with no credential cannot be read, and queueing a job that is
  -- certain to fail would put the failure in the worker's log instead of in
  -- front of the person who could fix it.
  if not v_has then
    raise exception 'that connection has no key stored' using errcode = '22023';
  end if;

  if v_status = 'syncing' then
    -- Already running. Returning quietly rather than raising: somebody who
    -- pressed the button twice has not made a mistake.
    return null;
  end if;

  insert into public.job_runs
    (organisation_id, kind, payload, singleton_key, max_attempts, requested_by)
  values
    (v_org, 'connection.sync',
     jsonb_build_object('connectionId', p_connection::text),
     -- One sync per connection at a time. Keyed on the connection rather than
     -- the organisation: two systems connected to one business are not
     -- competing for anything.
     'sync:' || p_connection::text,
     2,
     auth.uid())
  returning id into v_job;

  return v_job;
end;
$$;

revoke all on function public.request_connection_sync(uuid) from public, anon;
grant execute on function public.request_connection_sync(uuid) to authenticated;

-- ── the subscription guard ───────────────────────────────────────────────
--
-- Attached here rather than left out. The trigger was originally applied by
-- iterating the catalogue (migration 16), so a table created afterwards has to
-- opt in by hand — and test 19 fails if one does not, which is how this was
-- caught rather than discovered by a lapsed customer still syncing.
--
-- The worker is unaffected: it holds no JWT, and the guard lets an unclaimed
-- caller through precisely so that scheduled work keeps running.
create trigger zz_subscription_data_connection_syncs
  before insert or update or delete on public.data_connection_syncs
  for each row execute function amryn.refuse_lapsed_write();

notify pgrst, 'reload schema';
