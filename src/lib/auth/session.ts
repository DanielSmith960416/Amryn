import 'server-only';

/**
 * Session and workspace resolution.
 *
 * Every server component and server action starts here. `requireWorkspace()`
 * returns the caller, the organisation they are acting in, their role, their
 * scope and their effective permissions in a single round trip — or redirects,
 * which is why it is safe to treat its result as non-null everywhere else.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { isPermission, PermissionError, type Permission } from './permissions';
import { mfaChallengeOutstanding } from './mfa';
import {
  loadEntitlements,
  subscriptionAccess,
  EntitlementError,
  type Entitlement,
  type Entitlements,
  type SubscriptionAccess,
} from '@/lib/billing/entitlements';
import type { Enums, Row } from '@/types/database';

export const ACTIVE_ORG_COOKIE = 'amryn.org';

export interface Workspace {
  user: User;
  profile: Row<'user_profiles'> | null;
  organisation: Row<'organisations'>;
  membership: Row<'organisation_members'>;
  role: Enums['org_role'];
  scope: { kind: Enums['scope_kind']; ids: string[]; label: string };
  permissions: ReadonlySet<Permission>;
  /** The subscription this organisation is on. Absent only if the record is
   *  broken: create_organisation() opens one with every organisation. */
  subscription: Row<'subscriptions'> | null;
  /** What the plan includes. Resolved here so no page has to ask the plan's
   *  name and decide for itself what that means. */
  entitlements: Entitlements;
  /** Whether the subscription is paid, and what to say if it is not. */
  access: SubscriptionAccess;
  /** Every organisation the user belongs to, for the switcher. */
  organisations: { id: string; name: string; slug: string; role: Enums['org_role'] }[];
}

/**
 * The signed-in user, or null. Uses getUser() rather than getSession() so the
 * token is verified against the auth server rather than merely decoded.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Without configuration there is no session to have. Returning null lets
  // every caller take its existing signed-out path — which ends at the
  // sign-in page, where the missing configuration is explained — instead of
  // throwing a server-side exception on every route.
  if (!isSupabaseConfigured()) return null;

  // The same guard the middleware carries. An upstream failure — Supabase
  // unreachable, a rejected key, a network blip — should cost a redirect to
  // sign-in, not a server-side exception on whichever page the caller was on.
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch (error) {
    console.error('[amryn:auth] could not resolve the current user', error);
    return null;
  }
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/**
 * The signed-in user, with any outstanding second factor already presented.
 *
 * The redirect is a courtesy, not the control: what actually keeps the data
 * closed is the guard in the database, which refuses an aal1 session
 * regardless of which page it is on. Without this the platform would still be
 * safe and would render every page empty, which is a worse way to learn that
 * you need to reach for your phone.
 */
export async function requireVerifiedUser(): Promise<User> {
  const user = await requireUser();
  if (await mfaChallengeOutstanding()) redirect('/verify');
  return user;
}

/**
 * Resolves the organisation the user is acting in.
 *
 * Cached per request: the Command Centre alone would otherwise resolve this
 * a dozen times while rendering its panels.
 */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  if (!isSupabaseConfigured()) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from('organisation_members')
    .select('*, organisations!inner(id, name, slug)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (!memberships || memberships.length === 0) return null;

  const available = memberships
    .map((m) => {
      // The embed can be null or, for some relationship shapes, an array.
      // A membership whose organisation did not come back is not something to
      // crash over — it is one the user cannot act in, so drop it.
      const raw = m.organisations as unknown;
      const org = (Array.isArray(raw) ? raw[0] : raw) as
        | { id: string; name: string; slug: string }
        | null
        | undefined;
      if (!org?.id) return null;
      return { id: org.id, name: org.name, slug: org.slug, role: m.role };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  if (available.length === 0) return null;

  // Honour the switcher's choice if it is still a live membership.
  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const membership =
    memberships.find((m) => m.organisation_id === preferred) ?? memberships[0];
  if (!membership) return null;

  const [
    { data: organisation },
    { data: existingProfile },
    permissions,
    { data: subscription },
    entitlements,
  ] = await Promise.all([
    supabase.from('organisations').select('*').eq('id', membership.organisation_id).single(),
    supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
    resolvePermissions(membership.organisation_id, membership.id, membership.role),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('organisation_id', membership.organisation_id)
      .maybeSingle(),
    loadEntitlements(membership.organisation_id),
  ]);

  if (!organisation) return null;

  // A profile is normally written by a trigger on auth.users, which a hosted
  // Supabase project may refuse to install — the SQL editor does not own that
  // table. Where it is absent, nothing else creates the row, and the name and
  // avatar are missing everywhere for the life of the account.
  //
  // Only when it is actually missing, which is once per account at most.
  let profile = existingProfile;
  if (!profile) {
    const { error } = await supabase.rpc('ensure_user_profile');
    if (error) {
      // Not worth failing the page over: the profile is presentation, and the
      // rest of the workspace is already loaded.
      console.error('[amryn:auth] could not create the user profile', error.message);
    } else {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      profile = data;
    }
  }

  return {
    user,
    profile: profile ?? null,
    organisation,
    membership,
    role: membership.role,
    scope: {
      kind: membership.scope_kind,
      ids: membership.scope_ids,
      label: await describeScope(membership),
    },
    permissions,
    subscription: subscription ?? null,
    entitlements,
    access: subscriptionAccess(subscription ?? null),
    organisations: available,
  };
});

export async function requireWorkspace(): Promise<Workspace> {
  if (!isSupabaseConfigured()) redirect('/sign-in');

  // Before the lookup, not after. A session that owes a second factor is
  // refused every organisation row by the database, so getWorkspace() finds
  // nothing and the branch below would send someone who has been a member for
  // a year to create an organisation — which reads as having lost everything.
  if (await mfaChallengeOutstanding()) redirect('/verify');

  const workspace = await getWorkspace();
  if (!workspace) {
    const user = await getCurrentUser();
    // Signed in but belonging to nothing: send them to create an organisation
    // rather than to a sign-in page they have already passed.
    redirect(user ? '/onboarding' : '/sign-in');
  }
  return workspace;
}

/**
 * Effective permissions: the role's defaults, then per-member overrides.
 *
 * This mirrors amryn.has_permission() in the database. If the two ever
 * disagree, the database wins — the worst outcome is a control that is shown
 * and then refuses, never one that is hidden but works.
 */
async function resolvePermissions(
  organisationId: string,
  memberId: string,
  role: Enums['org_role'],
): Promise<ReadonlySet<Permission>> {
  const supabase = await createClient();

  const [{ data: defaults }, { data: overrides }] = await Promise.all([
    supabase.from('role_permissions').select('permission_key').eq('role', role),
    supabase
      .from('member_permission_overrides')
      .select('permission_key, granted')
      .eq('organisation_id', organisationId)
      .eq('member_id', memberId),
  ]);

  const effective = new Set<Permission>();
  for (const row of defaults ?? []) {
    if (isPermission(row.permission_key)) effective.add(row.permission_key);
  }
  for (const row of overrides ?? []) {
    if (!isPermission(row.permission_key)) continue;
    if (row.granted) effective.add(row.permission_key);
    else effective.delete(row.permission_key);
  }
  return effective;
}

async function describeScope(membership: Row<'organisation_members'>): Promise<string> {
  if (membership.scope_kind === 'organisation') return 'Whole organisation';

  const supabase = await createClient();
  const table =
    membership.scope_kind === 'region'
      ? 'regions'
      : membership.scope_kind === 'branch'
        ? 'branches'
        : 'departments';

  const { data } = await supabase.from(table).select('name').in('id', membership.scope_ids);
  const names = (data ?? []).map((r) => r.name);
  if (names.length === 0) return 'No assigned scope';
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/* ── guards ────────────────────────────────────────────────────────────── */

export function can(workspace: Workspace, permission: Permission): boolean {
  return workspace.permissions.has(permission);
}

/** Throws rather than redirecting: use inside server actions. */
export function assertPermission(workspace: Workspace, permission: Permission): void {
  if (!can(workspace, permission)) throw new PermissionError(permission);
}

/**
 * Resolve the workspace and require a permission in one call. Used at the top
 * of a page that should not exist for a user who cannot use it.
 */
export async function requirePermission(permission: Permission): Promise<Workspace> {
  const workspace = await requireWorkspace();
  if (!can(workspace, permission)) redirect('/command-centre?denied=' + permission);
  return workspace;
}

/* ── what the plan includes ────────────────────────────────────────────── */

export function includes(workspace: Workspace, entitlement: Entitlement): boolean {
  return workspace.entitlements.has(entitlement);
}

/** Throws rather than redirecting: use inside server actions. */
export function assertEntitlement(workspace: Workspace, entitlement: Entitlement): void {
  workspace.entitlements.assert(entitlement);
}

/**
 * The top of a page that a tier may not have bought.
 *
 * Sends the customer to the billing page rather than to a dead end, because
 * unlike a missing permission — which only an administrator can resolve — a
 * missing entitlement is something the person looking at the screen can
 * usually fix themselves.
 */
export async function requireEntitlement(entitlement: Entitlement): Promise<Workspace> {
  const workspace = await requireWorkspace();
  if (!includes(workspace, entitlement)) {
    redirect('/settings/billing?upgrade=' + entitlement);
  }
  return workspace;
}

/**
 * A server action that changes business records.
 *
 * The database refuses the write anyway — that is what actually protects the
 * boundary — but a refusal surfacing as a constraint violation is a poor way
 * to tell somebody their payment has not arrived.
 */
export function assertWritable(workspace: Workspace): void {
  if (workspace.access.state !== 'open') {
    throw new SubscriptionLapsedError(workspace.access.reason);
  }
}

export class SubscriptionLapsedError extends Error {
  constructor(reason: string) {
    super(reason || 'This account is on hold until the subscription is settled.');
    this.name = 'SubscriptionLapsedError';
  }
}

export { EntitlementError };
