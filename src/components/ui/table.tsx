import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The data table.
 *
 * Executive views are dense by design, and a table of stock lines or KPIs is
 * genuinely wide. Rather than hiding columns at small sizes — which turns a
 * compliance record into a partial one — the table scrolls inside its own
 * container, so the page body never scrolls sideways and no column is lost.
 */

export function TableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `relative` is load-bearing, not decoration. An absolutely positioned
        // descendant — a `sr-only` label, a tooltip — whose nearest positioned
        // ancestor is outside this element has the initial containing block for
        // its containing block, and `overflow` never clips such a descendant.
        // In a table scrolled 1,700px wide that puts the element at x≈1650 in
        // the *document*, so the whole page gains 1,300px of horizontal scroll
        // from something meant to be invisible. Making the scroll container
        // itself the containing block keeps it inside, where it belongs.
        'relative overflow-x-auto rounded-[var(--radius-card)]',
        'border border-[var(--border)] bg-[var(--card)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className={cn('w-full border-collapse text-[0.8125rem]', className)}>{children}</table>
  );
}

export function Th({
  children,
  numeric = false,
  className,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-[var(--border)] bg-[var(--card-inset)] px-3 py-2.5 font-label',
        'text-[0.6875rem] font-medium tracking-wide whitespace-nowrap text-[var(--text-secondary)] uppercase',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  className,
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-[var(--border)] px-3 py-2.5 align-top text-[var(--text-primary)]',
        numeric && 'numeric text-right whitespace-nowrap',
        className,
      )}
    >
      {children}
    </td>
  );
}

/** The last row of a table that totals: same columns, different weight. */
export function TotalRow({ children }: { children: ReactNode }) {
  return (
    <tr className="bg-[var(--card-inset)] font-semibold [&>td]:border-b-0">{children}</tr>
  );
}

/**
 * What a table says when it has nothing to show.
 *
 * "No expired stock" and "no data connected" mean very different things on a
 * compliance record, so the caller supplies the sentence rather than getting a
 * generic "No results".
 */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-8 text-center text-[0.8125rem] text-[var(--text-secondary)]"
      >
        {children}
      </td>
    </tr>
  );
}
