/*
 * The workspace, in one round trip instead of six.
 *
 * ── what was measured, before anything was changed ────────────────────────
 * Every authenticated page render resolves the same thing first: who is
 * asking, which organisation they are in, what they may do, and what their
 * plan includes. That was six separate PostgREST calls — memberships, the
 * organisation, the profile, the role's permissions, the member's overrides,
 * the subscription and the entitlement view — two of them sequential because
 * the second wave needs the organisation id the first wave returns.
 *
 * The database was never the cost. Measured on production:
 *
 *   organisation_members, EXPLAIN ANALYZE ......  6.6 ms execution
 *   alerts count, EXPLAIN ANALYZE ..............  0.1 ms execution
 *   web container CPU, 24h average .............  0.015% of two cores
 *
 * and against that, the same queries as seen by Supabase's own edge, which
 * excludes the network between Amsterdam and Ireland entirely:
 *
 *   /rest/v1/organisation_members .............. 288 ms avg, 594 ms p95
 *   /rest/v1/role_permissions .................. 312 ms avg, 741 ms p95
 *   /rest/v1/organisations ..................... 184 ms avg, 722 ms p95
 *   /rest/v1/organisation_entitlements ......... 120 ms avg
 *   /rest/v1/subscriptions .....................  98 ms avg
 *   /rest/v1/user_profiles .....................  96 ms avg
 *
 * So a query taking six milliseconds cost three hundred to ask. The time goes
 * on the asking, not the answering, and the only lever that moves it is asking
 * fewer times. /command-centre sat at 754-1291 ms p50 with an idle CPU.
 *
 * ── why this is safe to read from ─────────────────────────────────────────
 * SECURITY INVOKER, deliberately and not by omission. The function runs as the
 * caller, so every table it touches applies exactly the Row Level Security it
 * applies today — including amryn.mfa_satisfied(), which closes everything to
 * a session that still owes a second factor. It can return nothing that the
 * six separate calls could not already return to the same person. Collapsing
 * six questions into one changes how often we ask, not who may hear.
 *
 * It is STABLE rather than VOLATILE so the planner may fold it, and it names
 * its search_path so it cannot be redirected by one.
 *
 * ── additive ──────────────────────────────────────────────────────────────
 * One new function. No table, column, policy or row is altered or removed, and
 * the application keeps the query-by-query path it has always had and falls
 * back to it where this function is absent — a web release can reach a
 * database the worker has not migrated yet, and must not go blank when it does.
 */

create or replace function public.workspace_snapshot(p_preferred_org uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with mem as (
    select m.*
    from public.organisation_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
  ),
  /*
   * Joined to organisations rather than merely listed, because a membership
   * whose organisation this session cannot read is not one they can act in.
   * The application dropped those after the fact; this drops them before the
   * choice is made, so the cookie naming an unreadable organisation lands on
   * one that works instead of on an empty workspace.
   */
  visible as (
    select m.*, o.name as org_name, o.slug as org_slug
    from mem m
    join public.organisations o on o.id = m.organisation_id
  ),
  picked as (
    select v.organisation_id
    from visible v
    order by (v.organisation_id = p_preferred_org) desc nulls last, v.joined_at asc
    limit 1
  ),
  chosen as (
    select m.* from mem m join picked p on p.organisation_id = m.organisation_id
  )
  select case
    when not exists (select 1 from chosen) then null::jsonb
    else jsonb_build_object(
      'organisations', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('id', v.organisation_id, 'name', v.org_name, 'slug', v.org_slug, 'role', v.role)
            order by v.joined_at asc
          ),
          '[]'::jsonb
        )
        from visible v
      ),
      'membership', (select to_jsonb(c) from chosen c),
      'organisation', (
        select to_jsonb(o) from public.organisations o
        join picked p on p.organisation_id = o.id
      ),
      'profile', (
        select to_jsonb(u) from public.user_profiles u where u.id = auth.uid()
      ),
      'subscription', (
        select to_jsonb(s) from public.subscriptions s
        join picked p on p.organisation_id = s.organisation_id
        limit 1
      ),
      /*
       * The role's defaults, then the member's overrides — the same order
       * amryn.has_permission() resolves in, and the same order the TypeScript
       * resolved in when it read both tables itself. A revoking override has
       * to be able to take a default away, so the two are not simply unioned.
       */
      'permissions', (
        select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from (
          select rp.permission_key as k
          from public.role_permissions rp
          join chosen c on c.role = rp.role
          where not exists (
            select 1 from public.member_permission_overrides o
            where o.member_id = c.id
              and o.organisation_id = c.organisation_id
              and o.permission_key = rp.permission_key
              and o.granted is false
          )
          union
          select o.permission_key
          from public.member_permission_overrides o
          join chosen c on c.id = o.member_id and c.organisation_id = o.organisation_id
          where o.granted
        ) granted
      ),
      'entitlements', (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.sort_order), '[]'::jsonb)
        from public.organisation_entitlements e
        join picked p on p.organisation_id = e.organisation_id
      ),
      /*
       * The unread count on the bell, which the shell draws on every page and
       * was a call of its own — issued after the workspace had resolved,
       * because it needs the organisation id the workspace returns. It is one
       * index scan; it was never worth a second journey to Ireland for.
       */
      'unread_alerts', (
        select count(*) from public.alerts a
        join picked p on p.organisation_id = a.organisation_id
        where a.status = 'new'
      ),
      /*
       * The scope label, which was a seventh call and only ever for a member
       * scoped below the whole organisation. Resolved here for nothing, since
       * the row naming the scope is already in hand.
       */
      'scope_names', (
        select coalesce(jsonb_agg(n.name order by n.name), '[]'::jsonb)
        from chosen c
        cross join lateral (
          select r.name from public.regions r
            where c.scope_kind = 'region' and r.id = any(c.scope_ids)
          union all
          select b.name from public.branches b
            where c.scope_kind = 'branch' and b.id = any(c.scope_ids)
          union all
          select d.name from public.departments d
            where c.scope_kind = 'department' and d.id = any(c.scope_ids)
        ) n
      )
    )
  end;
$$;

comment on function public.workspace_snapshot(uuid) is
  'Everything requireWorkspace() needs, in one round trip. SECURITY INVOKER: '
  'row level security applies to every table it reads, exactly as it does to '
  'the separate queries this replaces.';

grant execute on function public.workspace_snapshot(uuid) to authenticated;
