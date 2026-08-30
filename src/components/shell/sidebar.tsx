'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { NavGroup } from './navigation';

/**
 * Secondary navigation.
 *
 * A drawer under `lg`, a fixed rail above it — the same component either way,
 * because two implementations of one navigation is how they drift apart.
 */
export function Sidebar({
  groups,
  open,
  onClose,
  scopeLabel,
  roleLabel,
}: {
  groups: NavGroup[];
  open: boolean;
  onClose: () => void;
  scopeLabel: string;
  roleLabel: string;
}) {
  const pathname = usePathname();

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)]',
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

        <nav className="px-2 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="eyebrow px-2.5 !mb-1.5">{group.label}</p>
              <ul>
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
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
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
