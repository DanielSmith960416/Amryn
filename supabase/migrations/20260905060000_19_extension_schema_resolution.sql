-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 19 — where the database looks for pgcrypto
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Five functions were dead on the hosted database. Not slow, not wrong —
-- dead, every call, for every caller:
--
--   request_subscription   42883  function gen_random_bytes(integer) does not exist
--   activation_preview     42883  function digest(text, unknown) does not exist
--   redeem_activation      42883  function digest(text, unknown) does not exist
--   invitation_preview     42883  function digest(text, unknown) does not exist
--   accept_invitation      42883  function digest(text, unknown) does not exist
--
-- Between them that is the whole of the paid journey and the whole of the team
-- journey: nobody could take out a subscription, nobody could be handed an
-- activation link after paying by EFT, and nobody could be invited into an
-- organisation. The screens were all built and all correct; the call at the
-- bottom of each one raised before it did anything.
--
-- ── why it was invisible ──────────────────────────────────────────────────
--
-- Migration 01 asks for the extension without saying where:
--
--     create extension if not exists "pgcrypto";
--
-- On a plain PostgreSQL instance that installs it into `public`, which is on
-- the search_path, and everything resolves. On Supabase pgcrypto is already
-- installed — into `extensions` — so `if not exists` does nothing at all and
-- the functions stay where Supabase put them.
--
-- Each of the five then pins `search_path = public, pg_temp`, correctly, so
-- that a caller cannot shadow what a SECURITY DEFINER function resolves. That
-- pin excludes `extensions`. The symbols are present in the database and
-- unreachable from inside the function.
--
-- CI runs the SQL suite against a plain PostgreSQL, where the extension lands
-- in `public` and all five pass. The failure exists only on the layout nobody
-- tested, which is the layout in production. Test 22 now recreates the hosted
-- arrangement, so this cannot come back silently.
--
-- ── the fix ───────────────────────────────────────────────────────────────
--
-- Add `extensions` to the pin rather than schema-qualifying each call site.
-- Qualifying would hardcode one of the two layouts and break the other; naming
-- both schemas is correct on both, because PostgreSQL ignores an entry in
-- search_path that does not exist. Nothing untrusted can write to `extensions`
-- — it is owned by the database owner and neither anon nor authenticated holds
-- CREATE on it — so widening the pin by that one schema gives up none of what
-- the pin is for.
--
-- ALTER rather than CREATE OR REPLACE: the bodies are right and were never the
-- problem, and restating them here would leave two copies to keep in step.

alter function public.request_subscription(public.subscription_plan, integer)
  set search_path = public, extensions, pg_temp;
alter function public.activation_preview(text)
  set search_path = public, extensions, pg_temp;
alter function public.redeem_activation(text)
  set search_path = public, extensions, pg_temp;
alter function public.invitation_preview(text)
  set search_path = public, extensions, pg_temp;
alter function public.accept_invitation(text)
  set search_path = public, extensions, pg_temp;

-- ── prove it, here, rather than trusting the ALTERs ───────────────────────
--
-- The five above are the ones known to be broken. This resolves the symbols
-- the way those functions now resolve them and fails the migration if either
-- is still unreachable, so a database that would go on refusing every payment
-- and every invitation cannot record this migration as applied.
do $$
declare
  probe bytea;
begin
  perform set_config('search_path', 'public, extensions, pg_temp', true);
  probe := digest('resolution probe', 'sha256');
  probe := gen_random_bytes(4);
exception when undefined_function then
  raise exception
    'pgcrypto is not reachable from public, extensions, pg_temp — subscriptions, activations and invitations would still fail'
    using errcode = '42883';
end $$;

-- ── while here: the five trigger functions with no pin at all ─────────────
--
-- Found by the same sweep. These are SECURITY INVOKER, so an unpinned path is
-- not the privilege escalation it would be above — a caller who shadowed a
-- name would only be shadowing it for themselves. It is still the one rule the
-- rest of the schema keeps without exception, and a trigger that decides
-- whether a branch belongs to your organisation is not where to start making
-- exceptions. Every object each of them touches is already schema-qualified,
-- so pinning changes no behaviour.

alter function amryn.assert_branch_region_same_org()     set search_path = public, pg_temp;
alter function amryn.assert_department_branch_same_org() set search_path = public, pg_temp;
alter function amryn.assert_health_weights_sum()         set search_path = public, pg_temp;
alter function amryn.derive_risk_severity()              set search_path = public, pg_temp;
alter function amryn.touch_updated_at()                  set search_path = public, pg_temp;

notify pgrst, 'reload schema';
