-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ — schema verification
--
-- Paste into the Supabase SQL editor after applying the migrations. Reads
-- only; safe to run repeatedly.
--
-- A migration skipped or run out of order does not fail loudly — it fails
-- later, as a confusing runtime error in an unrelated part of the product.
-- This turns that into one legible answer.
--
-- ── the counts are a snapshot, and the first row is not ───────────────────
-- Every count below has to be edited when a migration adds a table or a
-- policy, and the edit gets forgotten: this file once reported five red rows
-- against a database that was completely correct, which is worse than not
-- checking, because the one tool meant to confirm a migration landed was
-- crying wolf.
--
-- So the first row asks the question that actually matters — did every
-- migration record itself in the ledger — and answers it without a number
-- anybody has to maintain. The counts below corroborate it and catch a
-- migration that ran but did less than it should have.
-- ═══════════════════════════════════════════════════════════════════════════

with checks as (
  select 0 as ord, 'Migrations applied' as item,
         coalesce((select count(*)::text from amryn.schema_migrations), 'no ledger') as found,
         'all of them' as expected,
         -- The ledger is created by the first run, so its absence means none
         -- of this has been applied at all.
         (to_regclass('amryn.schema_migrations') is not null) as ok

  union all
  select 1 as ord, 'Tables' as item, count(*)::text as found, '61' as expected,
         (count(*) = 61) as ok
    from pg_tables where schemaname = 'public'

  union all
  select 2, 'Tables with RLS enabled', count(*)::text, '61', count(*) = 61
    from pg_tables t
    join pg_class c on c.relname = t.tablename
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where t.schemaname = 'public' and c.relrowsecurity

  union all
  select 3, 'RLS policies', count(*)::text, '165', count(*) = 165
    from pg_policies where schemaname = 'public'

  union all
  select 4, 'Permission catalogue', count(*)::text, '31', count(*) = 31
    from public.permissions

  union all
  select 5, 'Role grants', count(*)::text, '179', count(*) = 179
    from public.role_permissions

  union all
  select 6, 'Functions in the amryn schema', count(*)::text, '27', count(*) = 27
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'amryn'

  union all
  select 7, 'create_organisation()', count(*)::text, '1', count(*) = 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_organisation'

  -- The two things migration 07 adds. If these are missing, the first six
  -- migrations applied and the seventh did not.
  union all
  select 8, 'organisations.sector_scope (migration 07)', count(*)::text, '1', count(*) = 1
    from information_schema.columns
   where table_schema = 'public' and table_name = 'organisations'
     and column_name = 'sector_scope'

  union all
  select 9, 'tender opportunity kind (migration 07)', count(*)::text, '1', count(*) = 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'opportunity_kind' and e.enumlabel = 'tender'

  -- The queue, and the flag that decides whose work runs. If these are missing
  -- the web service is fine and nothing scheduled will ever happen, which is a
  -- failure with no symptom on any page.
  union all
  select 10, 'job_runs (migration 23)', count(*)::text, '1', count(*) = 1
    from pg_tables where schemaname = 'public' and tablename = 'job_runs'

  union all
  select 11, 'background_jobs flag (migration 23)', count(*)::text, '1', count(*) = 1
    from public.feature_flags where key = 'background_jobs'

  -- The Imprint, and its eight layers. A deployment missing these serves every
  -- screen correctly and cannot describe a single business.
  union all
  select 12, 'imprint_layers (migration 24)', count(*)::text, '1', count(*) = 1
    from pg_tables where schemaname = 'public' and tablename = 'imprint_layers'

  union all
  select 13, 'the eight layers (migration 24)', count(*)::text, '8', count(*) = 8
    from unnest(enum_range(null::public.imprint_layer))

  -- Provenance. Without it every asserted figure is a bare number again, and
  -- the constraints that stop an estimate being stored without a range go with
  -- it — a deployment that looks identical and quietly allows what this exists
  -- to forbid.
  union all
  select 14, 'the four kinds of provenance (migration 25)', count(*)::text, '4', count(*) = 4
    from unnest(enum_range(null::public.provenance))

  union all
  select 15, 'ranges are enforced (migration 25)', count(*)::text, '3', count(*) = 3
    from pg_constraint
   where conname in ('insight_uncertainty_carries_a_range',
                     'recommendation_uncertainty_carries_a_range',
                     'opportunity_uncertainty_carries_a_range')

  -- The amryn schema must not be reachable through the API. It holds the
  -- functions the policies call.
  union all
  select 10, 'amryn schema hidden from anon', count(*)::text, '0', count(*) = 0
    from information_schema.role_usage_grants
   where object_schema = 'amryn' and grantee = 'anon'

  -- Nothing between signing up and using the platform matters more than this
  -- one call, and it is the one that failed in production. Exactly one, so a
  -- leftover overload cannot make the call ambiguous.
  union all
  select 11, 'create_organisation exists, once (migration 08)', count(*)::text, '1', count(*) = 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_organisation'

  union all
  select 12, 'its parameters are all text (migration 08)',
         coalesce((select string_agg(distinct t::regtype::text, ',')
                     from pg_proc p
                     join pg_namespace n on n.oid = p.pronamespace
                     cross join lateral unnest(p.proargtypes) as t
                    where n.nspname = 'public' and p.proname = 'create_organisation'), 'none'),
         'text',
         (select bool_and(t = 'text'::regtype)
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            cross join lateral unnest(p.proargtypes) as t
           where n.nspname = 'public' and p.proname = 'create_organisation')

  union all
  select 13, 'authenticated may call it (migration 08)',
         has_function_privilege('authenticated',
           'public.create_organisation(text,text,text,text,text)', 'execute')::text,
         'true',
         has_function_privilege('authenticated',
           'public.create_organisation(text,text,text,text,text)', 'execute')
)
select item, found, expected,
       case when ok then 'OK' else 'CHECK THIS' end as status
  from checks order by ord;
