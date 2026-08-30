import { AppShell } from '@/components/shell/app-shell';
import { visibleGroups, visiblePrimary } from '@/components/shell/navigation';
import { requireWorkspace } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

/**
 * Every authenticated route sits inside this layout, so `requireWorkspace()`
 * runs once per request and the redirect for a signed-out or org-less user
 * happens in one place rather than at the top of twenty pages.
 */
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
