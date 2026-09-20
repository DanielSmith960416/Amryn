'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Table, TableWrap, Td, Th, EmptyRow } from '@/components/ui/table';
import { cn } from '@/lib/utils/cn';

/**
 * A table whose columns can be sorted.
 *
 * ── one of these, not one per flagship ────────────────────────────────────
 * The Command Centre shows the opportunity pipeline and the risk register
 * side by side. Two tables written separately would drift — one sorting
 * ascending first and the other descending, one keeping the arrow after a
 * re-sort and the other not — and the difference would read as a fault in
 * whichever the customer looked at second. So the behaviour lives once and
 * both pass their own columns in.
 *
 * ── what sorting a score means ────────────────────────────────────────────
 * A numeric column sorts descending first, because the question somebody asks
 * of a risk score or a deal value is "which is the biggest", not "which is
 * the smallest". A text column sorts ascending first, because that question
 * is "where is the one beginning with M". Neither is a preference; both are
 * what the first click should already have done.
 */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Right-aligned and tabular. Also decides which way the first click sorts. */
  numeric?: boolean;
  /** Omit to make a column unsortable — an actions or badge-only column. */
  sortBy?: (row: T) => number | string;
  render: (row: T) => ReactNode;
  /** Hidden below `sm`, for a column that is context rather than the point. */
  secondary?: boolean;
}

export type Direction = 'asc' | 'desc';

/**
 * The comparison itself, exported so it can be tested without a DOM.
 *
 * Strings compare with localeCompare so an accented name sorts where a reader
 * expects rather than after z, and numbers compare numerically rather than as
 * strings — "9" before "10", which lexicographic order gets backwards.
 */
export function compareRows<T>(
  a: T,
  b: T,
  sortBy: (row: T) => number | string,
  direction: Direction,
): number {
  const left = sortBy(a);
  const right = sortBy(b);
  const sign = direction === 'asc' ? 1 : -1;

  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * sign;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true }) * sign;
}

/** Which way a column sorts when it is first clicked. */
export function initialDirection(numeric: boolean | undefined): Direction {
  return numeric ? 'desc' : 'asc';
}

export function sortRows<T>(
  rows: readonly T[],
  column: Column<T> | undefined,
  direction: Direction,
): T[] {
  if (!column?.sortBy) return [...rows];
  const sortBy = column.sortBy;
  /*
   * Sorted off a copy. Sorting the caller's array in place would reorder the
   * workspace object every render, and the "unsorted" state would stop being
   * recoverable — the order the engine ranked them in is itself a result.
   */
  return [...rows].sort((a, b) => compareRows(a, b, sortBy, direction));
}

export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  /** The column sorted on load. Omit to show the order the caller supplied. */
  initialSort,
  empty,
  caption,
}: {
  rows: readonly T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: string;
  empty: ReactNode;
  caption: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort ?? null);
  const [direction, setDirection] = useState<Direction>(() =>
    initialDirection(columns.find((c) => c.key === initialSort)?.numeric),
  );

  const active = columns.find((c) => c.key === sortKey);
  const sorted = useMemo(() => sortRows(rows, active, direction), [rows, active, direction]);

  function toggle(column: Column<T>) {
    if (!column.sortBy) return;
    if (column.key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column.key);
      setDirection(initialDirection(column.numeric));
    }
  }

  return (
    <TableWrap>
      <Table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const isActive = column.key === sortKey;
              return (
                <Th
                  key={column.key}
                  numeric={column.numeric}
                  className={cn(column.secondary && 'hidden sm:table-cell', 'p-0')}
                  /*
                    aria-sort goes on the header cell, not the button inside
                    it: it describes the column, and a screen reader announces
                    it when the cell is reached rather than only when the
                    control within it takes focus.
                  */
                  {...(column.sortBy
                    ? { 'aria-sort': isActive ? sortState(direction) : 'none' }
                    : {})}
                >
                  {column.sortBy ? (
                    <button
                      type="button"
                      onClick={() => toggle(column)}
                      className={cn(
                        'flex w-full items-center gap-1 px-3 py-2.5 font-label text-[0.6875rem]',
                        'font-medium tracking-wide uppercase transition-colors',
                        'hover:text-[var(--text-primary)]',
                        'focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:outline-none',
                        column.numeric ? 'justify-end' : 'justify-start',
                        isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                      )}
                    >
                      {column.header}
                      {/*
                        The arrow marks the sorted column and its direction.
                        A permanent arrow on every header — the common
                        alternative — says every column is sorted, which is
                        three quarters wrong on a four-column table.
                      */}
                      <span aria-hidden className="text-[0.625rem] leading-none">
                        {isActive ? (direction === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  ) : (
                    <span className="block px-3 py-2.5">{column.header}</span>
                  )}
                </Th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <EmptyRow colSpan={columns.length}>{empty}</EmptyRow>
          ) : (
            sorted.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-[var(--card-inset)]">
                {columns.map((column) => (
                  <Td
                    key={column.key}
                    numeric={column.numeric}
                    className={cn(column.secondary && 'hidden sm:table-cell')}
                  >
                    {column.render(row)}
                  </Td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function sortState(direction: Direction): 'ascending' | 'descending' {
  return direction === 'asc' ? 'ascending' : 'descending';
}
