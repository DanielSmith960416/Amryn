'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { TopNav } from './top-nav';
import type { NavGroup, NavItem } from './navigation';
import type { Enums } from '@/types/database';
import { LegalFooter } from '@/components/legal/legal-footer';

/**
 * The dashboard chrome.
 *
 * A client component purely because the sidebar opens and closes; every page
 * rendered inside it stays a server component, so no page data crosses the
 * client boundary just to be laid out.
 */
export function AppShell({
  primary,
  groups,
  organisations,
  activeOrganisationId,
  userName,
  userEmail,
  organisationName,
  scopeLabel,
  roleLabel,
  unreadCount,
  children,
}: {
  primary: NavItem[];
  groups: NavGroup[];
  organisations: { id: string; name: string; slug: string; role: Enums['org_role'] }[];
  activeOrganisationId: string;
  userName: string;
  userEmail: string;
  organisationName: string;
  scopeLabel: string;
  roleLabel: string;
  unreadCount: number;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[var(--brand)] focus:px-3 focus:py-2 focus:text-[var(--on-brand)]"
      >
        Skip to content
      </a>

      <TopNav
        primary={primary}
        organisations={organisations}
        activeOrganisationId={activeOrganisationId}
        userName={userName}
        userEmail={userEmail}
        organisationName={organisationName}
        unreadCount={unreadCount}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      <div className="flex">
        <Sidebar
          groups={groups}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          scopeLabel={scopeLabel}
          roleLabel={roleLabel}
        />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
          <LegalFooter className="mt-12 border-t border-[var(--border)] pt-5" />
        </main>
      </div>
    </div>
  );
}
