'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { updateSectorScope, type SectorScopeState } from './actions';
import type { Enums } from '@/types/database';

const SECTORS: { value: Enums['market_sector']; label: string; note: string }[] = [
  { value: 'private', label: 'Private', note: 'Commercial opportunities and partnerships' },
  { value: 'public', label: 'Public', note: 'Government and municipal tenders' },
  { value: 'mixed', label: 'Mixed', note: 'Public-private arrangements' },
  { value: 'unknown', label: 'Unclassified', note: 'Sector not yet determined' },
];

export function SectorScopeForm({ current }: { current: Enums['market_sector'][] }) {
  const [state, action] = useActionState(updateSectorScope, { status: 'idle' } as SectorScopeState);

  return (
    <form action={action} className="space-y-3">
      <fieldset>
        <legend className="sr-only">Sectors the radar may surface</legend>
        <ul className="space-y-2">
          {SECTORS.map((sector) => (
            <li key={sector.value}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2.5 transition-colors hover:border-[var(--border-strong)]">
                <input
                  type="checkbox"
                  name="sectors"
                  value={sector.value}
                  defaultChecked={current.includes(sector.value)}
                  className="mt-0.5 size-4 accent-[var(--brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-medium text-[var(--text-primary)]">
                    {sector.label}
                  </span>
                  <span className="block text-[0.75rem] text-[var(--text-tertiary)]">
                    {sector.note}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {state.status === 'error' ? (
        <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === 'saved' ? (
        <p className="text-[0.8125rem] text-[var(--positive)]" role="status">
          Saved. The radar will honour this from the next scan.
        </p>
      ) : null}

      <Save />
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save sector scope'}
    </Button>
  );
}
