'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { NAV_GROUPS, PRIMARY_NAV, isActive, type NavItem } from './navigation';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

/**
 * The client-area chrome.
 *
 * This is the one client component in the layout, and only because the mobile
 * drawer opens and closes. Every page rendered inside it stays a server
 * component, so no workspace data crosses the client boundary just to be laid
 * out — the Intelligence Layer runs on the server and ships HTML.
 */

function NavLabel({ item }: { item: NavItem }) {
  return (
    <>
      {item.label}
      {item.trademark ? <sup className="tm">{item.trademark}</sup> : null}
    </>
  );
}

export function AppShell({
  userName,
  userEmail,
  companyName,
  isDemo,
  children,
}: {
  userName: string;
  userEmail: string;
  companyName: string;
  isDemo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Navigating is the end of the drawer's job. Without this it stays open over
  // the page the reader just asked for.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[var(--brand)] focus:px-3 focus:py-2 focus:text-[var(--on-brand)]"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--card-inset)] lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>

          <Link href="/command-centre" className="flex shrink-0 items-center gap-2">
            <Image
              src="/brand/amryn-icon-mark.png"
              alt=""
              width={553}
              height={563}
              className="size-6 w-auto dark:hidden"
              priority
            />
            <Image
              src="/brand/amryn-icon-mark-white.png"
              alt=""
              width={553}
              height={563}
              className="hidden size-6 w-auto dark:block"
              priority
            />
            <span className="font-display text-[0.9375rem] font-semibold tracking-tight">
              Amryn<sup className="tm">™</sup>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 xl:flex" aria-label="Primary">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href, pathname) ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors',
                  isActive(item.href, pathname)
                    ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]',
                )}
              >
                <NavLabel item={item} />
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {isDemo ? (
              <span className="hidden rounded-[var(--radius-pill)] bg-[var(--warning-soft)] px-2.5 py-1 font-mono text-[0.6875rem] font-medium tracking-wide text-[var(--warning)] uppercase sm:inline">
                Demo data
              </span>
            ) : null}
            <ThemeToggle />
            <UserMenu name={userName} email={userEmail} company={companyName} />
          </div>
        </div>
      </header>

      <div className="flex">
        <SidebarNav pathname={pathname} className="hidden lg:block" />

        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            <div className="absolute inset-y-0 left-0 w-[17rem] overflow-y-auto bg-[var(--surface)] shadow-[var(--shadow-pop)]">
              <div className="flex h-14 items-center justify-between px-4">
                <span className="eyebrow">Navigate</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--card-inset)]"
                  aria-label="Close navigation"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNav pathname={pathname} showHints />
            </div>
          </div>
        ) : null}

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  className,
  showHints = false,
}: {
  pathname: string;
  className?: string;
  showHints?: boolean;
}) {
  return (
    <nav
      aria-label="Sections"
      className={cn(
        'w-[15.5rem] shrink-0 self-start border-r border-[var(--border)] px-3 py-5',
        'lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto',
        className,
      )}
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-5 last:mb-0">
          <p className="eyebrow px-2.5 pb-1.5">{group.label}</p>
          <ul>
            {group.items.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-lg px-2.5 py-1.5 text-[0.8125rem] transition-colors',
                      active
                        ? 'bg-[var(--brand-soft)] font-medium text-[var(--brand)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <NavLabel item={item} />
                    {showHints && item.hint ? (
                      <span className="mt-0.5 block text-[0.75rem] text-[var(--text-tertiary)]">
                        {item.hint}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
