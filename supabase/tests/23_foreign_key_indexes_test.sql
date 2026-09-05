-- ═══════════════════════════════════════════════════════════════════════════
-- Test 23 — every foreign key is indexed
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PostgreSQL indexes the parent side of a foreign key and leaves the child to
-- you. Nothing complains, so seventy-four accumulated before an advisor
-- counted them.
--
-- Two costs, and the second is the one that bites first. Every RLS policy here
-- filters on organisation_id, so an unindexed one is a sequential scan on
-- every read. And deleting a parent row makes PostgreSQL check each child
-- table that references it — a sequential scan per parent deleted, whether or
-- not anyone ever queries that column. Deleting an organisation, which the
-- POPIA erasure path does, walks every one of them.
--
-- Asserted rather than remembered, because the next table added carries the
-- same trap and nothing in a code review makes it visible.

\set ON_ERROR_STOP on

do $$
declare
  bare text[];
begin
  select array_agg(format('%s.%s', c.conrelid::regclass, c.conname) order by 1) into bare
    from pg_constraint c
   where c.contype = 'f'
     and c.connamespace = 'public'::regnamespace
     and not exists (
       -- An index serves a foreign key only when the key's columns are a
       -- prefix of the index. (organisation_id, branch_id) covers the
       -- organisation_id key and does nothing for the branch_id one, so a
       -- containment test alone would pass a schema that is still scanning.
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::smallint[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and array_length(c.conkey, 1)
              = array_length((i.indkey::smallint[])[0:array_length(c.conkey, 1) - 1], 1)
     );

  if bare is not null then
    raise exception
      'these foreign keys have no covering index, so a parent delete scans the child table: %',
      array_to_string(bare, ', ');
  end if;
end $$;

select 'test 23: every foreign key in public is covered by an index' as passed;
