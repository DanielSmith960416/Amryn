import { AppShell } from '@/components/shell/app-shell';
import { visibleGroups, visiblePrimary } from '@/components/shell/navigation';
import { requireWorkspace } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

/**
 * Every authenticated route sits inside this layout, so `requireWorkspace()`
 * runs once per request and the redirect for a signed-out or org-less user
 * happens in one place rather than at the top of twenty pages.
 *
 * Nothing under here can be prerendered: every page is a function of who is
 * asking, and Row Level Security narrows the data per session. Declaring that
 * explicitly also keeps the build honest — without it, Next attempts a
 * prerender, reaches for Supabase credentials that a fresh deployment has not
 * been given yet, and fails the build before anyone has had a chance to set
 * them.
 */
export const dynamic = 'force-dynamic';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const workspace = await requireWorkspace();
  const supabase = await createClient();

  const { count } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', workspace.organisation.id)
    .eq('status', 'new');

  const name =
    workspace.profile?.full_name ?? workspace.user.email?.split('@')[0] ?? 'Account';

  return (
    <AppShell
      primary={visiblePrimary(workspace.permissions)}
      groups={visibleGroups(workspace.permissions)}
      organisations={workspace.organisations}
      activeOrganisationId={workspace.organisation.id}
      userName={name}
      userEmail={workspace.user.email ?? ''}
      scopeLabel={workspace.scope.label}
      roleLabel={ROLE_LABELS[workspace.role] ?? workspace.role}
      unreadCount={count ?? 0}
    >
      {children}
    </AppShell>
  );
}
