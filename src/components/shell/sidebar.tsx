'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { NavGroup, NavItem } from './navigation';

const COLLAPSED_KEY = 'amryn.nav.collapsed';

/**
 * Secondary navigation.
 *
 * A drawer under `lg`, a fixed rail above it — the same component either way,
 * because two implementations of one navigation is how they drift apart.
 *
 * ── what sits outside the scrolling list ─────────────────────────────────
 * Billing and Settings are above the groups, outside the scroll, so they stay
 * put whether the reader is at the top of the list, at the bottom of it, or
 * has collapsed every section.
 *
 * They were under the groups at first, which reads as tidy and puts them last
 * — with five sections open, most of a phone screen from the top, with the way
 * to pay under the fold. They belong to the account rather than to the work,
 * so they sit beside the statement of whose account it is.
 *
 * The version used to close the rail. It is in the page footer now, with the
 * privacy and cookie links: that is where the small print lives, and a rail is
 * for the places somebody is going.
 *
 * ── collapsing, and what is remembered ───────────────────────────────────
 * Each heading is a button. What is collapsed is kept in this browser, per
 * section, so somebody who never opens Operations stops scrolling past it.
 *
 * Everything is expanded in the first render, and what the browser remembers
 * is applied after mount. The server cannot read localStorage, so rendering a
 * collapsed section on the server would be guessing — and guessing wrong
 * produces a hydration mismatch, which React resolves by throwing away the
 * markup and starting again. Expanded-then-collapse is one frame of movement;
 * the alternative is a re-render of the whole rail.
 *
 * A section holding the current page is never collapsed on arrival, whatever
 * was remembered: hiding the row that says where you are is disorienting, and
 * it makes the rail look like it has lost the page.
 */
export function Sidebar({
  groups,
  pinned,
  open,
  onClose,
  scopeLabel,
  roleLabel,
}: {
  groups: NavGroup[];
  pinned: NavItem[];
  open: boolean;
  onClose: () => void;
  scopeLabel: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let stored: string[] = [];
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) stored = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      // A browser that refuses storage simply gets everything expanded.
      return;
    }

    // Never start with the section you are standing in closed.
    const here = groups.find((group) => group.items.some((item) => item.href === pathname));
    setCollapsed(new Set(stored.filter((label) => label !== here?.label)));
  }, [groups, pathname]);

  function toggle(label: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Forgetting costs one extra click next time.
      }
      return next;
    });
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-y-0 border-l-0 glass-strong rounded-none',
          'transition-transform duration-200 ease-out lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100dvh-3.5rem)] lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Sections"
      >
        <div className="flex items-center justify-between px-4 py-3 lg:hidden">
          <span className="eyebrow !mb-0">Navigation</span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--card-inset)]"
            aria-label="Close navigation"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* What this reader can see, stated plainly. A dashboard that shows
            part of a business should say so rather than imply it is all of it. */}
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="eyebrow !mb-1">Your view</p>
          <p className="text-[0.8125rem] font-medium text-[var(--text-primary)]">{scopeLabel}</p>
          <p className="text-[0.6875rem] text-[var(--text-tertiary)]">{roleLabel}</p>
        </div>

        {/*
          Above the groups, not below them.
          ── why it moved ──────────────────────────────────────────────────
          These two were pinned under the scrolling list, which reads as tidy
          and puts them last. With five groups open that is most of a phone
          screen away, and the one thing down there was the way to pay: a
          business on a trial had to open the rail, scroll past every section
          it was not looking for, and find Billing under the fold.

          Nobody should have to go looking in order to subscribe. So the two
          rows that belong to the account rather than to the work sit at the
          top, next to the statement of whose account it is.

          Still outside the scrolling list, so the groups scroll under them
          and neither row can be pushed off. Pinning changes where a row is,
          never who may open it — Billing keeps manage_billing, and a member
          without it still sees nothing here.
        */}
        <div className="border-b border-[var(--border)] px-2 py-2">
          <ul>
            {pinned.map((item) => (
              <li key={item.href}>
                <Row item={item} active={pathname === item.href} onClose={onClose} />
              </li>
            ))}
          </ul>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => {
            const shut = collapsed.has(group.label);
            const id = `nav-${group.label.toLowerCase().replace(/\W+/g, '-')}`;
            return (
              <div key={group.label} className="mb-4 last:mb-0">
                <button
                  type="button"
                  onClick={() => toggle(group.label)}
                  aria-expanded={!shut}
                  aria-controls={id}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-left hover:bg-[var(--card-inset)]"
                >
                  <span className="eyebrow-strong !mb-0">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-[var(--text-tertiary)] transition-transform duration-150',
                      shut && '-rotate-90',
                    )}
                    aria-hidden
                  />
                </button>

                <ul id={id} hidden={shut} className="mt-1.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Row item={item} active={pathname === item.href} onClose={onClose} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function Row({
  item,
  active,
  onClose,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block rounded-lg px-2.5 py-1.5 text-[0.8125rem] transition-colors',
        active
          ? 'bg-[var(--brand-soft)] font-medium text-[var(--brand)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]',
      )}
    >
      {item.label}
      {item.trademark ? <span className="tm">{item.trademark}</span> : null}
      {/* Not hidden. Somebody who cannot see a feature cannot decide they
          want it. */}
      {item.locked ? (
        <span
          className="ml-1.5 rounded px-1 py-px align-middle text-[0.5625rem] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] ring-1 ring-[var(--border)]"
          title="Not part of your plan yet"
        >
          Upgrade
        </span>
      ) : null}
    </Link>
  );
}
