-- ═══════════════════════════════════════════════════════════════════════════
-- Amryn™ AIGrowthIntelligence® Software
-- Migration 21 — take back the anon grants nothing asked for
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every SECURITY DEFINER function from migration 04 to migration 15 ends with
-- a line taking back what PostgreSQL grants by default:
--
--     revoke all on function public.accept_invitation(text) from public, anon;
--
-- Migrations 16 and 17 wrote nine such functions and remembered it twice.
-- The other five are reachable by anyone holding the publishable key, over
-- /rest/v1/rpc/, without signing in.
--
-- None of them is exploitable — each was probed on the live database as anon
-- and each refuses:
--
--     ensure_onboarding      42501  not a member of that organisation
--     complete_onboarding    42501  only an administrator can finish setting up
--     request_subscription   28000  not signed in
--     redeem_activation      requires auth.uid() to record who activated
--
-- So this changes no answer. It changes where the answer is decided: at the
-- grant, rather than eleven statements into a function body that had to be
-- read to know it was safe. Every one of these is called by the application
-- with a session — redeem_activation() through requireUser() in
-- features/billing/activate.ts — so nothing loses a caller it had.
--
-- The point is not this week's function bodies. It is that a guard added in
-- one place is one edit away from being removed, and the convention the rest
-- of the schema keeps means that edit cannot silently open a door.

-- Revoke then grant, both halves, as migration 11 does for accept_invitation.
-- The revoke alone would lock out the people these exist for: on a database
-- built from these migrations `authenticated` has no grant of its own on any
-- of the four and reaches them through the default PUBLIC one, so taking that
-- back takes their own access with it. The SQL suite caught exactly that —
-- test 19 could no longer buy a subscription.

revoke all on function public.ensure_onboarding(uuid) from public, anon;
grant execute on function public.ensure_onboarding(uuid) to authenticated;

revoke all on function public.complete_onboarding(uuid) from public, anon;
grant execute on function public.complete_onboarding(uuid) to authenticated;

revoke all on function public.request_subscription(public.subscription_plan, integer) from public, anon;
grant execute on function public.request_subscription(public.subscription_plan, integer) to authenticated;

revoke all on function public.redeem_activation(text) from public, anon;
grant execute on function public.redeem_activation(text) to authenticated;

-- ── the one that stays open, and why ──────────────────────────────────────
--
-- activation_preview() answers the page somebody lands on from the email
-- before they have signed in — "Amryn (Pty) Ltd, Professional, ready" — and
-- must keep answering it. Possession of the link is the whole authorisation,
-- which is why the function returns the organisation, the plan and the state
-- and not the amount, the reference, or who paid.
--
-- Revoked from PUBLIC and granted to anon deliberately, exactly as
-- invitation_preview() is: the two are the same shape and the same decision.
revoke all on function public.activation_preview(text) from public;
grant execute on function public.activation_preview(text) to anon, authenticated;

notify pgrst, 'reload schema';
