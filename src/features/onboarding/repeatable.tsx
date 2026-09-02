'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A list of rows somebody can add to.
 *
 * Three questions in this flow are "list the ones you have" — sites,
 * objectives, competitors — and all three are answered by people who do not
 * know in advance how many rows they need. Starting with one and adding on
 * demand is the shape that does not make somebody count first.
 *
 * Rows are never removed from the DOM by index: the key is a counter, not the
 * position, so removing the second of three does not silently move the third
 * one's typed value up into it.
 */
export function Repeatable({
  addLabel,
  max = 20,
  children,
}: {
  addLabel: string;
  max?: number;
  children: (index: number) => React.ReactNode;
}) {
  const [keys, setKeys] = useState<number[]>([0]);
  const [next, setNext] = useState(1);

  return (
    <div className="space-y-3">
      {keys.map((key, position) => (
        <div key={key} className="relative">
          {children(position)}
          {keys.length > 1 ? (
            <button
              type="button"
              onClick={() => setKeys((k) => k.filter((x) => x !== key))}
              className="mt-1 text-[0.6875rem] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        disabled={keys.length >= max}
        onClick={() => {
          setKeys((k) => [...k, next]);
          setNext((n) => n + 1);
        }}
        className={cn(
          'text-[0.8125rem] font-medium text-[var(--brand)] underline underline-offset-2',
          keys.length >= max && 'cursor-not-allowed opacity-50 no-underline',
        )}
      >
        {keys.length >= max ? `That is as many as we can take here` : addLabel}
      </button>
    </div>
  );
}
