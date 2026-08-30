'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, Settings, User } from 'lucide-react';
import { signOut } from '@/features/auth/actions';

export function UserMenu({ name, email }: { name: string; email: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || email.charAt(0).toUpperCase();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex size-8 items-center justify-center rounded-full bg-[var(--brand-soft)] font-mono text-[0.6875rem] font-semibold text-[var(--brand)] transition-opacity hover:opacity-80"
        aria-label={`Account: ${name}`}
      >
        {initials}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] p-1 shadow-[var(--shadow-pop)]"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-[0.8125rem] font-medium text-[var(--text-primary)]">{name}</p>
            <p className="truncate text-[0.6875rem] text-[var(--text-tertiary)]">{email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />

          <DropdownMenu.Item asChild>
            <Link
              href="/settings/profile"
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] text-[var(--text-primary)] outline-none data-[highlighted]:bg-[var(--card-inset)]"
            >
              <User className="size-3.5 text-[var(--text-tertiary)]" aria-hidden />
              Profile
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] text-[var(--text-primary)] outline-none data-[highlighted]:bg-[var(--card-inset)]"
            >
              <Settings className="size-3.5 text-[var(--text-tertiary)]" aria-hidden />
              Settings
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />

          <DropdownMenu.Item asChild>
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-[var(--text-primary)] outline-none data-[highlighted]:bg-[var(--card-inset)]"
              >
                <LogOut className="size-3.5 text-[var(--text-tertiary)]" aria-hidden />
                Sign out
              </button>
            </form>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
