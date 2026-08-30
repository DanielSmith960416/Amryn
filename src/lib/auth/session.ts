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
import { isPermission, PermissionError, type Permission } from './permissions';
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
  /** Every organisation the user belongs to, for the switcher. */
  organisations: { id: string; name: string; slug: string; role: Enums['org_role'] }[];
}

/**
 * The signed-in user, or null. Uses getUser() rather than getSession() so the
 * token is verified against the auth server rather than merely decoded.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/**
 * Resolves the organisation the user is acting in.
 *
 * Cached per request: the Command Centre alone would otherwise resolve this
 * a dozen times while rendering its panels.
 */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
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

  const available = memberships.map((m) => {
    const org = m.organisations as unknown as { id: string; name: string; slug: string };
    return { id: org.id, name: org.name, slug: org.slug, role: m.role };
  });

  // Honour the switcher's choice if it is still a live membership.
  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const membership =
    memberships.find((m) => m.organisation_id === preferred) ?? memberships[0];
  if (!membership) return null;

  const [{ data: organisation }, { data: profile }, permissions] = await Promise.all([
    supabase.from('organisations').select('*').eq('id', membership.organisation_id).single(),
    supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
    resolvePermissions(membership.organisation_id, membership.id, membership.role),
  ]);

  if (!organisation) return null;

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
    organisations: available,
  };
});

export async function requireWorkspace(): Promise<Workspace> {
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
