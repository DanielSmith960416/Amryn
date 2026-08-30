-- ── privileges for tables added later ─────────────────────────────────────
--
-- Migration 05 grants `authenticated` its table privileges with
-- `grant ... on all tables in schema public`. That phrasing is a snapshot: it
-- covers the tables existing at the moment it runs, and says nothing about any
-- added afterwards. A table created by a future migration would therefore be
-- unreachable by every signed-in user, and PostgREST would report it as
-- missing from the schema cache rather than as a privilege problem — which is
-- a long way from the cause.
--
-- Default privileges close that, so the grant applies to what does not exist
-- yet.
--
-- Deliberately nothing for `anon`. It holds no privilege on these tables and
-- should not: every one of the 45 policies targets `authenticated`, so Row
-- Level Security alone would already return an anonymous caller nothing, and
-- withholding the grant as well means a policy misconfigured tomorrow still
-- cannot leak to an anonymous request. 10_rls_isolation_test.sql asserts that
-- second wall is standing.

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

notify pgrst, 'reload schema';
