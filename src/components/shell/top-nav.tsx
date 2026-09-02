'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Menu, Search, Sparkles } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { OrganisationSwitcher } from './organisation-switcher';
import { UserMenu } from './user-menu';
import { cn } from '@/lib/utils/cn';
import type { NavItem } from './navigation';
import type { Enums } from '@/types/database';

/**
 * Sticky top navigation (specification §15).
 *
 * Pill navigation in the centre, identity on the left, tools on the right. The
 * active pill is filled rather than underlined, which reads at a glance on a
 * dark surface where an underline disappears.
 */
export function TopNav({
  primary,
  organisations,
  activeOrganisationId,
  userName,
  userEmail,
  organisationName,
  unreadCount,
  onOpenSidebar,
}: {
  primary: NavItem[];
  organisations: { id: string; name: string; slug: string; role: Enums['org_role'] }[];
  activeOrganisationId: string;
  userName: string;
  userEmail: string;
  /** The organisation being acted in, shown under the name in the menu. */
  organisationName: string;
  unreadCount: number;
  onOpenSidebar: () => void;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="-ml-1 flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--card-inset)] lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-4.5" aria-hidden />
        </button>

        <Link href="/command-centre" className="flex shrink-0 items-center gap-2" aria-label="Amryn, Command Centre">
          {/* Supplied artwork only — never recoloured, stretched or outlined. */}
          <Image
            src="/brand/amryn-icon-mark.png"
            alt=""
            width={553}
            height={563}
            className="h-6 w-auto dark:hidden"
            priority
          />
          <Image
            src="/brand/amryn-icon-mark-white.png"
            alt=""
            width={553}
            height={563}
            className="hidden h-6 w-auto dark:block"
            priority
          />
          <span className="font-display text-[1.0625rem] font-extrabold tracking-tight text-[var(--text-primary)]">
            Amryn<span className="tm">™</span>
          </span>
        </Link>

        <div className="hidden md:block">
          <OrganisationSwitcher organisations={organisations} activeId={activeOrganisationId} />
        </div>

        <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label="Primary">
          {primary.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-[var(--radius-pill)] px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors',
                  active
                    ? 'bg-[var(--brand)] text-[var(--on-brand)] shadow-[0_0_0_3px_var(--brand-soft)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]',
                )}
              >
                {item.label}
                {item.trademark ? <span className="tm">{item.trademark}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <Link
            href="/search"
            className="flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]"
            aria-label="Search"
          >
            <Search className="size-4" aria-hidden />
          </Link>

          <Link
            href="/assistant"
            className="flex size-9 items-center justify-center rounded-lg text-[var(--brand)] hover:bg-[var(--brand-soft)]"
            aria-label="AI Assistant"
          >
            <Sparkles className="size-4" aria-hidden />
          </Link>

          <Link
            href="/alerts"
            className="relative flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]"
            aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : 'Alerts'}
          >
            <Bell className="size-4" aria-hidden />
            {unreadCount > 0 ? (
              <span className="numeric absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--negative)] px-1 text-[0.5625rem] font-semibold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Link>

          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          <UserMenu name={userName} email={userEmail} company={organisationName} />
        </div>
      </div>
    </header>
  );
}
