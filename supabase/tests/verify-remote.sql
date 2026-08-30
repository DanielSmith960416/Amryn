-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ — schema verification
--
-- Paste into the Supabase SQL editor after applying the migrations. Reads
-- only; safe to run repeatedly.
--
-- A migration skipped or run out of order does not fail loudly — it fails
-- later, as a confusing runtime error in an unrelated part of the product.
-- This turns that into one legible answer.
-- ═══════════════════════════════════════════════════════════════════════════

with checks as (
  select 1 as ord, 'Tables' as item, count(*)::text as found, '45' as expected,
         (count(*) = 45) as ok
    from pg_tables where schemaname = 'public'

  union all
  select 2, 'Tables with RLS enabled', count(*)::text, '45', count(*) = 45
    from pg_tables t
    join pg_class c on c.relname = t.tablename
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where t.schemaname = 'public' and c.relrowsecurity

  union all
  select 3, 'RLS policies', count(*)::text, '143', count(*) = 143
    from pg_policies where schemaname = 'public'

  union all
  select 4, 'Permission catalogue', count(*)::text, '30', count(*) = 30
    from public.permissions

  union all
  select 5, 'Role grants', count(*)::text, '172', count(*) = 172
    from public.role_permissions

  union all
  select 6, 'Functions in the amryn schema', count(*)::text, '15', count(*) = 15
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

  -- The amryn schema must not be reachable through the API. It holds the
  -- functions the policies call.
  union all
  select 10, 'amryn schema hidden from anon', count(*)::text, '0', count(*) = 0
    from information_schema.role_usage_grants
   where object_schema = 'amryn' and grantee = 'anon'
)
select item, found, expected,
       case when ok then 'OK' else 'CHECK THIS' end as status
  from checks order by ord;
