import { AppShell } from '@/components/shell/app-shell';
import { visibleGroups, visiblePinned, visiblePrimary } from '@/components/shell/navigation';
import { can, requireWorkspace } from '@/lib/auth/session';
import { AccountNotice } from '@/features/billing/account-notice';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import packageJson from '../../../package.json';
import { RememberDevice } from '@/components/shell/remember-device';
import { BirthdayBanner } from '@/features/profile/birthday-banner';

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

  /*
    Normally already counted: workspace_snapshot() returns it alongside
    everything else, so the bell costs nothing. The query below is for a
    database that predates migration 51, where the workspace comes from the
    separate queries and has no count to hand back.
  */
  const unread = workspace.unreadAlerts ?? (await countUnreadAlerts(workspace.organisation.id));

  const name =
    workspace.profile?.full_name ?? workspace.user.email?.split('@')[0] ?? 'Account';

  return (
    <AppShell
      primary={visiblePrimary(workspace.permissions, workspace.entitlements)}
      groups={visibleGroups(workspace.permissions, workspace.entitlements)}
      pinned={visiblePinned(workspace.permissions, workspace.entitlements)}
      /*
        Read here rather than in the sidebar, which is a client component:
        importing package.json there would inline the whole file — every
        dependency name and version — into the browser bundle to print one
        string. This is the single source of truth the brief asked for, kept
        on the server side of the boundary.
      */
      version={packageJson.version}
      organisations={workspace.organisations}
      activeOrganisationId={workspace.organisation.id}
      userName={name}
      userEmail={workspace.user.email ?? ''}
      organisationName={workspace.organisation.name}
      scopeLabel={workspace.scope.label}
      roleLabel={ROLE_LABELS[workspace.role] ?? workspace.role}
      unreadCount={unread}
      /*
        The subscription, in the chrome. The AccountNotice below explains a
        subscription that needs attention, but only inside the last fortnight;
        before that nothing on any screen said a trial was running, and the way
        to pay was the last row of a rail somebody had to open first.
      */
      subscriptionState={workspace.access.state}
      trialing={workspace.access.trialing}
      subscriptionEndingOn={workspace.access.endingOn?.toISOString() ?? null}
      canManageBilling={can(workspace, 'manage_billing')}
    >
      {/*
        Both of these live here rather than on a page, and for the same reason:
        this layout wraps every authenticated route, so the birthday is noticed
        wherever somebody happens to land that morning, and the name is
        remembered whichever page they opened. Neither renders anything on the
        server — one is a date the browser owns, the other is storage only the
        browser can reach.
      */}
      <RememberDevice firstName={workspace.profile?.first_name ?? null} />
      <BirthdayBanner
        dateOfBirth={workspace.profile?.date_of_birth ?? null}
        firstName={workspace.profile?.first_name ?? null}
      />
      <AccountNotice
        access={workspace.access}
        canManageBilling={can(workspace, 'manage_billing')}
      />
      {children}
    </AppShell>
  );
}

/** The bell's count, for a database that predates migration 51. */
async function countUnreadAlerts(organisationId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('status', 'new');
  return count ?? 0;
}
