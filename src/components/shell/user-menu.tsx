'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings } from 'lucide-react';
import { clearProfile, initials } from '@/lib/profile';

/**
 * Who is signed in, and the way out.
 *
 * Hand-built rather than pulled from a menu library: it is one dropdown with
 * three items, and a dependency for that would cost more than it saves. What it
 * still has to do properly is close on Escape and on a click outside, because a
 * menu that traps focus is worse than no menu.
 */
export function UserMenu({
  name,
  email,
  company,
}: {
  name: string;
  email: string;
  company: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex size-9 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[0.75rem] font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand)] hover:text-[var(--on-brand)]"
      >
        {initials(name)}
        <span className="sr-only">Account menu</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-elevated)] shadow-[var(--shadow-pop)]"
        >
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="truncate text-[0.875rem] font-medium text-[var(--text-primary)]">
              {name}
            </p>
            <p className="truncate text-[0.8125rem] text-[var(--text-secondary)]">{email}</p>
            <p className="mt-1 truncate text-[0.75rem] text-[var(--text-tertiary)]">{company}</p>
          </div>

          <Link
            href="/settings"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-[0.8125rem] text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]"
          >
            <Settings className="size-4" />
            Settings
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              clearProfile();
              router.push('/');
            }}
            className="flex w-full items-center gap-2.5 border-t border-[var(--border)] px-4 py-2.5 text-left text-[0.8125rem] text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]"
          >
            <LogOut className="size-4" />
            Forget this device
          </button>
        </div>
      ) : null}
    </div>
  );
}
