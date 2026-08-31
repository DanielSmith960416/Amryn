import { AppShell } from '@/components/shell/app-shell';
import { requireUser } from '@/lib/auth/current-user';
import { loadWorkspace } from '@/lib/workspace';

/**
 * The client area.
 *
 * `requireUser` runs here, once, so every page beneath this layout is behind
 * authentication by construction rather than by each page remembering to check.
 * The previous build used Next middleware for this; a layout guard is simpler
 * and, because it runs in the Node runtime, it can read the account store.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspace = loadWorkspace();

  return (
    <AppShell
      userName={user.fullName}
      userEmail={user.email}
      companyName={user.companyName}
      isDemo={workspace.isDemo}
    >
      {children}
    </AppShell>
  );
}
