-- Files a customer uploads, and the wall between one customer's and another's.
--
-- The rows in data_documents are a catalogue; the bytes are in storage. Both
-- sides need the same wall, and the storage half is the one that would
-- otherwise go untested — its schema belongs to Supabase, which is a reason to
-- shim it (see 00_supabase_shim.sql) and not a reason to trust it.
--
-- What is asserted here is the thing a customer would sue over: that a signed-
-- in member of one organisation cannot see, fetch, or plant a file belonging
-- to another.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok then raise notice 'pass  %', what;
  else raise exception 'FAIL  %', what; end if;
end $$;

create or replace function pg_temp.refused(stmt text, needle text) returns boolean
language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  if position(lower(needle) in lower(sqlerrm)) > 0 then return true; end if;
  raise exception 'statement failed for an unrelated reason: %', sqlerrm;
end $$;

create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end $$;

-- ── fixtures ──────────────────────────────────────────────────────────────

set local role postgres;

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'owner@alpha.test'),
  ('e2222222-2222-2222-2222-222222222222', 'manager@alpha.test'),
  ('e3333333-3333-3333-3333-333333333333', 'owner@beta.test');

insert into public.organisations (id, name, slug) values
  ('f0000000-0000-0000-0000-0000000000a1', 'Alpha Trading', 'alpha-trading'),
  ('f0000000-0000-0000-0000-0000000000b2', 'Beta Wholesale', 'beta-wholesale');

insert into public.subscriptions (organisation_id, plan, status) values
  ('f0000000-0000-0000-0000-0000000000a1', 'professional', 'active'),
  ('f0000000-0000-0000-0000-0000000000b2', 'professional', 'active');

-- An executive may import. A department manager holds view_data_sources and
-- not import_data, which is the pair the two policies are keyed on and the
-- reason that role is the useful one to test with — a viewer holds neither and
-- would prove only that a member with no permissions has none.
insert into public.organisation_members (organisation_id, user_id, role, scope_kind, scope_ids) values
  ('f0000000-0000-0000-0000-0000000000a1', 'e1111111-1111-1111-1111-111111111111', 'executive', 'organisation', '{}'),
  ('f0000000-0000-0000-0000-0000000000a1', 'e2222222-2222-2222-2222-222222222222', 'department_manager', 'organisation', '{}'),
  ('f0000000-0000-0000-0000-0000000000b2', 'e3333333-3333-3333-3333-333333333333', 'executive', 'organisation', '{}');

insert into public.data_documents
  (id, organisation_id, filename, content_type, byte_size, handling, storage_path, uploaded_by)
values
  ('aa000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000a1',
   'Supplier agreement.pdf', 'application/pdf', 184320, 'document',
   'f0000000-0000-0000-0000-0000000000a1/aa000000-0000-0000-0000-0000000000a1',
   'e1111111-1111-1111-1111-111111111111'),
  ('bb000000-0000-0000-0000-0000000000b2', 'f0000000-0000-0000-0000-0000000000b2',
   'Bank statement.pdf', 'application/pdf', 92160, 'document',
   'f0000000-0000-0000-0000-0000000000b2/bb000000-0000-0000-0000-0000000000b2',
   'e3333333-3333-3333-3333-333333333333');

insert into storage.objects (bucket_id, name, owner) values
  ('documents', 'f0000000-0000-0000-0000-0000000000a1/aa000000-0000-0000-0000-0000000000a1',
   'e1111111-1111-1111-1111-111111111111'),
  ('documents', 'f0000000-0000-0000-0000-0000000000b2/bb000000-0000-0000-0000-0000000000b2',
   'e3333333-3333-3333-3333-333333333333');

-- ── the catalogue ─────────────────────────────────────────────────────────

set local role authenticated;

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111');

select pg_temp.check(
  (select count(*) from public.data_documents) = 1
  and (select filename from public.data_documents) = 'Supplier agreement.pdf',
  'a member sees their own organisation''s files and only those');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.data_documents
      (organisation_id, filename, byte_size, handling, storage_path)
    values ('f0000000-0000-0000-0000-0000000000b2', 'planted.pdf', 10, 'document', 'x/y')
  $$, 'row-level security'),
  'and cannot file a document into somebody else''s organisation');

select pg_temp.act_as('e2222222-2222-2222-2222-222222222222');

select pg_temp.check(
  (select count(*) from public.data_documents) = 1,
  'someone who may see data sources may read the file list');

select pg_temp.check(
  pg_temp.refused($$
    insert into public.data_documents
      (organisation_id, filename, byte_size, handling, storage_path)
    values ('f0000000-0000-0000-0000-0000000000a1', 'reader.pdf', 10, 'document', 'a/b')
  $$, 'row-level security'),
  'and may not add to it — uploading is import_data, which reading does not carry');

-- ── what "handling" is allowed to say ─────────────────────────────────────
--
-- The column is the whole of the promise the interface makes about a file, so
-- a third value invented in a hurry must not be storable. 'analysed' is
-- exactly the word somebody would reach for.

set local role postgres;

select pg_temp.check(
  pg_temp.refused($$
    insert into public.data_documents
      (organisation_id, filename, byte_size, handling, storage_path)
    values ('f0000000-0000-0000-0000-0000000000a1', 'x.pdf', 10, 'analysed', 'a/c')
  $$, 'check constraint'),
  'a file is read or kept, and nothing may claim a third thing happened to it');

-- ── the bytes ─────────────────────────────────────────────────────────────

set local role authenticated;

select pg_temp.act_as('e3333333-3333-3333-3333-333333333333');

select pg_temp.check(
  (select count(*) from storage.objects where bucket_id = 'documents') = 1
  and (select amryn.storage_org(name) from storage.objects where bucket_id = 'documents')
      = 'f0000000-0000-0000-0000-0000000000b2',
  'and in storage, Beta sees one object — its own');

select pg_temp.check(
  not exists (
    select 1 from storage.objects
     where name = 'f0000000-0000-0000-0000-0000000000a1/aa000000-0000-0000-0000-0000000000a1'
  ),
  'Alpha''s file is not merely hidden from the list, it cannot be addressed by name');

select pg_temp.check(
  pg_temp.refused($$
    insert into storage.objects (bucket_id, name)
    values ('documents', 'f0000000-0000-0000-0000-0000000000a1/planted')
  $$, 'row-level security'),
  'nor can a file be planted under another tenant''s prefix');

-- A delete the policy does not match is not an error; it matches no rows and
-- reports success. That is the dangerous shape — a caller could believe it had
-- worked — so the assertion is that the file is still there afterwards.
delete from storage.objects
 where name = 'f0000000-0000-0000-0000-0000000000a1/aa000000-0000-0000-0000-0000000000a1';

set local role postgres;

select pg_temp.check(
  exists (
    select 1 from storage.objects
     where name = 'f0000000-0000-0000-0000-0000000000a1/aa000000-0000-0000-0000-0000000000a1'
  ),
  'and a delete aimed at another tenant''s file leaves it exactly where it was');

set local role authenticated;
select pg_temp.act_as('e3333333-3333-3333-3333-333333333333');

-- ── a path that is not tenant-shaped ──────────────────────────────────────
--
-- The policies cast the first path segment to a uuid. A cast that raises turns
-- a denial into a failed query, which reads as an outage; storage_org returns
-- null instead, and has_permission(null, …) is false.

select pg_temp.check(
  amryn.storage_org('not-a-uuid/file.pdf') is null
  and amryn.storage_org('') is null
  and amryn.storage_org('f0000000-0000-0000-0000-0000000000a1/x')
      = 'f0000000-0000-0000-0000-0000000000a1'::uuid,
  'a path with no tenant in it belongs to no one, and does not raise');

set local role postgres;

insert into storage.objects (bucket_id, name) values ('documents', 'rubbish/file.pdf');

set local role authenticated;
select pg_temp.act_as('e1111111-1111-1111-1111-111111111111');

select pg_temp.check(
  (select count(*) from storage.objects where bucket_id = 'documents') = 1,
  'so an object with a malformed path is visible to nobody instead of erroring for everybody');

rollback;
