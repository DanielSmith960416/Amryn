'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import { clearProfile, initials } from '@/lib/profile';
import { signOut } from '@/features/auth/actions';

/**
 * Who is signed in, and the way out.
 *
 * Hand-built rather than pulled from a menu library: it is one dropdown with
 * three items, and a dependency for that would cost more than it saves. What it
 * still has to do properly is close on Escape and on a click outside, because a
 * menu that traps focus is worse than no menu.
 *
 * ── there was no way out ──────────────────────────────────────────────────
 * This menu's last item said "Forget this device" under a sign-out icon, and
 * what it did was clear the remembered name out of localStorage and push the
 * router at `/`. It never touched the session. `signOut` has existed in
 * features/auth/actions.ts since the application shell was built — ending the
 * Supabase session, clearing the active-workspace cookie and recording the
 * event — and nothing in the product has ever called it.
 *
 * So the session survived, `/` redirected back to the Command Centre, and
 * anybody trying to reach /sign-in afterwards was bounced straight back by the
 * middleware, which sends a signed-in visitor away from that page. From the
 * outside: you cannot sign out, and you cannot sign back in. Both are the same
 * bug, and both are this button.
 *
 * It is a form now, because ending a session is a server's job. The local
 * cache is still cleared — a remembered name belongs to the person who just
 * left, not to whoever signs in next on this machine — but as the first step
 * of leaving rather than as the whole of it.
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

          {/* The action redirects to /sign-in, so nothing here navigates. */}
          <form action={signOut} className="border-t border-[var(--border)]">
            <button
              type="submit"
              role="menuitem"
              onClick={() => clearProfile()}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[0.8125rem] text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
