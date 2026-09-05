-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 20 — evaluate auth.uid() once per query, not once per row
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Twelve policies name auth.uid() directly. PostgreSQL treats that as a
-- per-row expression and calls it again for every row it examines, so reading
-- a thousand notifications reads the JWT a thousand times. Wrapping it in a
-- scalar subquery makes it an InitPlan: computed once, before the scan, and
-- compared against as a constant.
--
--   using (user_id = auth.uid())            → one call per row
--   using (user_id = (select auth.uid()))   → one call per query
--
-- The two are equivalent. auth.uid() is STABLE — by definition it cannot
-- change within a statement — so a single evaluation is not an approximation
-- of the per-row one, it is the same answer arrived at once. Nothing about who
-- can see what changes here, which is the only reason this is worth doing at
-- all: an optimisation that alters a tenancy boundary is not an optimisation.
--
-- Left alone deliberately: amryn.is_member(organisation_id) and
-- amryn.has_permission(organisation_id, ...). They read auth.uid() too, but
-- they take a column as an argument, so they genuinely do depend on the row
-- and cannot be hoisted out of the scan. Wrapping those would change what they
-- are asked, not when.
--
-- Policies are dropped and recreated rather than altered, because ALTER POLICY
-- cannot change a policy's command or roles and restating the whole thing
-- makes the diff readable. Each is recreated with the same command, the same
-- roles and the same predicate, differing only in the parenthesised select.

-- ── user_profiles ─────────────────────────────────────────────────────────

drop policy user_profiles_read on public.user_profiles;
create policy user_profiles_read on public.user_profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
        from public.organisation_members me
        join public.organisation_members them
          on them.organisation_id = me.organisation_id
       where me.user_id = (select auth.uid())
         and me.status = 'active'
         and them.user_id = user_profiles.id
    )
  );

drop policy user_profiles_write on public.user_profiles;
create policy user_profiles_write on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- ── organisation_members ──────────────────────────────────────────────────
--
-- The first arm is what lets somebody see their own membership row in an
-- organisation they are not yet active in; is_member() would refuse it.

drop policy members_read on public.organisation_members;
create policy members_read on public.organisation_members
  for select to authenticated
  using (user_id = (select auth.uid()) or amryn.is_member(organisation_id));

-- ── opportunity_assignments ───────────────────────────────────────────────

drop policy opportunity_assignments_read on public.opportunity_assignments;
create policy opportunity_assignments_read on public.opportunity_assignments
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or amryn.has_permission(organisation_id, 'view_opportunities')
  );

-- ── notifications ─────────────────────────────────────────────────────────
--
-- The table this matters most on: a notification list is read constantly and
-- is the one place a user routinely scans many of their own rows at once.

drop policy notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── the assistant's own conversations ─────────────────────────────────────

drop policy ai_conversations_own on public.ai_conversations;
create policy ai_conversations_own on public.ai_conversations
  for all to authenticated
  using (user_id = (select auth.uid()) and amryn.is_member(organisation_id))
  with check (user_id = (select auth.uid()) and amryn.is_member(organisation_id));

drop policy ai_messages_own on public.ai_messages;
create policy ai_messages_own on public.ai_messages
  for all to authenticated
  using (
    amryn.is_member(organisation_id)
    and exists (
      select 1 from public.ai_conversations c
       where c.id = ai_messages.conversation_id
         and c.user_id = (select auth.uid())
    )
  )
  with check (
    amryn.is_member(organisation_id)
    and exists (
      select 1 from public.ai_conversations c
       where c.id = ai_messages.conversation_id
         and c.user_id = (select auth.uid())
    )
  );

-- ── POPIA requests and recovery codes ─────────────────────────────────────

drop policy data_requests_read_own on public.data_requests;
create policy data_requests_read_own on public.data_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy data_requests_create_own on public.data_requests;
create policy data_requests_create_own on public.data_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy mfa_recovery_read_own on public.mfa_recovery_codes;
create policy mfa_recovery_read_own on public.mfa_recovery_codes
  for select to authenticated
  using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
