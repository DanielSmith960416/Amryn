-- ═══════════════════════════════════════════════════════════════════════════
-- 37. Files a customer gives Amryn
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now the only file the platform would take was a stocktake, and only as
-- a CSV. Everything else a business actually holds — the supplier contract, the
-- bank statement, the lease, the insurance schedule, the month-end pack a
-- bookkeeper emails as a PDF — had nowhere to go.
--
-- ── the distinction this table is built around ───────────────────────────
--
-- Amryn can do exactly two things with a file, and conflating them would be
-- the beginning of a much worse product:
--
--   read it   A spreadsheet. Its columns and rows are legible, so what is in
--             them can become stock lines, records, figures — things the Twin
--             may reason from.
--
--   keep it   Everything else. It is stored, listed, and handed back when
--             asked for. Nobody has read it. No score moves because of it.
--
-- `handling` records which, per file, and it is not decoration: it is what
-- stops a page saying "12 documents analysed" over a folder of PDFs nothing
-- opened. The rule against the model filling a numeric gap from memory is the
-- same rule — a business that believed Amryn had read its contracts would be
-- relying on an analysis that never happened.
--
-- ── where the bytes are ──────────────────────────────────────────────────
--
-- In Supabase Storage, not in this table. A bytea column would put a customer's
-- files into every backup dump, every restore-check, and the replication
-- stream, and would make the row-count arithmetic in backup.mjs meaningless.
-- The row here is the record; `storage_path` is the pointer.
--
-- ── purely additive ──────────────────────────────────────────────────────
--
-- One table, one bucket, four policies, one trigger. No column is dropped, no
-- row updated, nothing existing altered — so this applies to a live database
-- without the backup gate, which is the shape every migration here is meant
-- to have.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.data_documents (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,

  filename         text not null check (length(filename) between 1 and 300),
  content_type     text not null default '',
  byte_size        bigint not null check (byte_size >= 0),

  -- 'table' or 'document'. Constrained rather than free text, because the
  -- interface makes a promise about what happened to the file based on it.
  handling         text not null check (handling in ('table', 'document')),

  -- '<organisation_id>/<document id>'. The customer's own file name is *not*
  -- in the path: it would have to be sanitised, sanitising is where path
  -- traversal bugs live, and the name is already in the column above.
  storage_path     text not null unique,

  -- sha256 of the contents. Two uploads of the same file are a common accident
  -- and this is how a page can say so.
  checksum         text not null default '',

  -- What reading it found, where it was readable. Empty for a document.
  sheet_names      text[] not null default '{}',
  columns_found    text[] not null default '{}',
  row_count        integer not null default 0 check (row_count >= 0),

  -- Why it could not be read, where it was a spreadsheet and would not open.
  -- Kept rather than discarded: "we tried and here is what went wrong" is a
  -- different statement from "we did not try", and the list has to show both.
  read_error       text not null default '',

  note             text not null default '' check (length(note) <= 2000),

  uploaded_by      uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on table public.data_documents is
  'A file a customer uploaded. handling says whether Amryn read its rows or is merely holding it.';

comment on column public.data_documents.handling is
  'table: rows were read and may be used. document: stored and given back, never interpreted.';

create index data_documents_org_idx
  on public.data_documents (organisation_id, created_at desc);

-- Migration 22's rule: every foreign key gets an index, so a cascade delete
-- does not sequentially scan.
create index data_documents_uploaded_by_idx on public.data_documents (uploaded_by);

-- Finding the duplicate somebody just uploaded again.
create index data_documents_checksum_idx
  on public.data_documents (organisation_id, checksum)
  where checksum <> '';

create trigger data_documents_touch
  before update on public.data_documents
  for each row execute function amryn.touch_updated_at();

-- ── who may read and write them ───────────────────────────────────────────

alter table public.data_documents enable row level security;
alter table public.data_documents force row level security;

create policy data_documents_read on public.data_documents
  for select to authenticated
  using (amryn.has_permission(organisation_id, 'view_data_sources'));

create policy data_documents_write on public.data_documents
  for all to authenticated
  using (amryn.has_permission(organisation_id, 'import_data'))
  with check (amryn.has_permission(organisation_id, 'import_data'));

-- ── the lapsed-subscription guard ─────────────────────────────────────────
--
-- Attached by hand, as migration 18 explains: migration 16 attached these by
-- iterating the catalogue as it stood then, and a table added afterwards
-- carries none. Test 19 asserts the whole list, so a new table is a failing
-- test until somebody decides in writing which side of the line it is on.
--
-- Guarded. An organisation whose subscription has lapsed keeps every file it
-- has already given us — those are its records and withholding them would be
-- leverage, not enforcement — and cannot add more.
create trigger zz_subscription_data_documents
  before insert or update or delete on public.data_documents
  for each row execute function amryn.refuse_lapsed_write();

-- ═══════════════════════════════════════════════════════════════════════════
-- The bucket, and who may reach into it
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Private. A public bucket serves any object to anyone holding its URL, and
-- these are one company's contracts and bank statements.
--
-- Access is by signed URL, minted per request by a server that has already
-- established which organisation the caller belongs to. The policies below are
-- the second lock: if a bug ever hands a customer a client that queries
-- storage directly, the database still refuses the other tenants' rows.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

/*
 * The organisation that owns an object, from its path.
 *
 * Objects are named '<organisation_id>/<document id>', so the first segment is
 * the tenant. The regexp guard is not defensive padding: an object whose first
 * segment is not a UUID would raise on the cast, and a policy that raises is a
 * policy that fails a query rather than denying a row — which reads as an
 * outage instead of a refusal. Null means "no organisation", and
 * has_permission(null, …) is false.
 */
create or replace function amryn.storage_org(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when split_part(p_name, '/', 1)
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

comment on function amryn.storage_org(text) is
  'The tenant that owns a storage object, read from the first segment of its path. Null if the path is not tenant-shaped.';

create policy documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and amryn.has_permission(amryn.storage_org(name), 'view_data_sources')
  );

create policy documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and amryn.has_permission(amryn.storage_org(name), 'import_data')
  );

create policy documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and amryn.has_permission(amryn.storage_org(name), 'import_data')
  )
  with check (
    bucket_id = 'documents'
    and amryn.has_permission(amryn.storage_org(name), 'import_data')
  );

create policy documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and amryn.has_permission(amryn.storage_org(name), 'import_data')
  );

notify pgrst, 'reload schema';
