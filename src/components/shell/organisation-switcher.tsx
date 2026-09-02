'use client';

import { useTransition } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { switchOrganisation } from '@/features/organisation/actions';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils/cn';
import type { Enums } from '@/types/database';

export function OrganisationSwitcher({
  organisations,
  activeId,
}: {
  organisations: { id: string; name: string; slug: string; role: Enums['org_role'] }[];
  activeId: string;
}) {
  const [pending, startTransition] = useTransition();
  const active = organisations.find((o) => o.id === activeId);

  // Nothing to switch between: show the name without implying a control.
  if (organisations.length <= 1) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
        <Building2 className="size-3.5" aria-hidden />
        <span className="max-w-[14ch] truncate">{active?.name ?? 'Organisation'}</span>
      </span>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={pending}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5',
          'text-[0.8125rem] text-[var(--text-primary)] transition-colors hover:bg-[var(--card-inset)]',
          pending && 'opacity-60',
        )}
      >
        <Building2 className="size-3.5 text-[var(--text-tertiary)]" aria-hidden />
        <span className="max-w-[16ch] truncate">{active?.name ?? 'Select'}</span>
        <ChevronDown className="size-3 text-[var(--text-tertiary)]" aria-hidden />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-56 rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] p-1 shadow-[var(--shadow-pop)]"
        >
          <DropdownMenu.Label className="eyebrow px-2.5 py-2">Organisations</DropdownMenu.Label>
          {organisations.map((organisation) => (
            <DropdownMenu.Item
              key={organisation.id}
              onSelect={() => startTransition(() => switchOrganisation(organisation.id))}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] outline-none data-[highlighted]:bg-[var(--card-inset)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--text-primary)]">{organisation.name}</span>
                <span className="block text-[0.6875rem] text-[var(--text-tertiary)]">
                  {ROLE_LABELS[organisation.role] ?? organisation.role}
                </span>
              </span>
              {organisation.id === activeId ? (
                <Check className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
              ) : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
