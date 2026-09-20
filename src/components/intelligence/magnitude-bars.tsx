'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Comparing magnitudes, which is the one thing a ring is bad at.
 *
 * ── why this exists beside the donut ──────────────────────────────────────
 * A ring answers "what is this made of". It cannot answer "which of these is
 * bigger", because the eye judges angle poorly: two slices a few points apart
 * read as equal however carefully they are drawn. Branch revenue is exactly
 * the second question — somebody looking at it wants to know which branch is
 * carrying the year — and it was drawn as a ring, which is the wrong shape for
 * it. Bars share a baseline, so the comparison is a length against a length
 * and needs no estimating at all.
 *
 * ── one colour, and that is deliberate ───────────────────────────────────
 * Every bar is the same hue. Colouring them darker-where-bigger is the obvious
 * decoration and it is a mistake: the length already says which is bigger, so
 * a ramp spends the one channel that could carry new information on repeating
 * old information. It also fails the palette checks by construction, because a
 * ramp runs the full lightness band and drops below the chroma floor at the
 * pale end. Branch names have no order of their own, so there is no order for
 * a colour to encode.
 *
 * Horizontal rather than vertical, because the categories are place names and
 * a column chart would set "Gqeberha" on its side or truncate it.
 */

export interface Bar {
  /** Stable across renders. */
  key: string;
  label: string;
  value: number;
  /** What to print at the end of the bar — the caller owns currency and rounding. */
  display: string;
}

/** A tenth of a hairline, so a real-but-tiny value is still a mark. */
const MIN_WIDTH = 1.5;

export interface Measured extends Bar {
  /** Percentage of the longest bar, which is what sets the scale. */
  width: number;
  /** Percentage of the total, which is what the readout states. */
  share: number;
}

/**
 * Bars to widths.
 *
 * ── the scale is the largest bar, not the total ──────────────────────────
 * Drawing each bar as its share of the total is the other obvious choice and
 * it wastes most of the width: four branches averaging a quarter each would
 * never fill more than a quarter of the card, and the differences that matter
 * would be squeezed into it. Scaling to the largest uses the whole width and
 * keeps every ratio between bars exactly right, which is the only thing a
 * reader takes from a bar chart.
 *
 * Sorted largest first. Unlike the ring this costs nothing, because every bar
 * is the same colour — there is no identity for a change in order to break.
 */
export function measure(bars: Bar[]): Measured[] {
  const present = bars.filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
  if (present.length === 0) return [];

  const largest = present[0]!.value;
  const total = present.reduce((sum, b) => sum + b.value, 0);

  return present.map((bar) => ({
    ...bar,
    width: Math.max((bar.value / largest) * 100, MIN_WIDTH),
    share: bar.value / total,
  }));
}

export function MagnitudeBars({
  bars,
  caption,
  className,
}: {
  bars: Bar[];
  /** What the bars are, for a screen reader. */
  caption: string;
  className?: string;
}) {
  const measured = measure(bars);
  const [active, setActive] = useState<string | null>(null);

  if (measured.length === 0) return null;

  return (
    <div className={cn('space-y-1', className)}>
      <p className="sr-only">{caption}</p>
      <ul className="space-y-2">
        {measured.map((bar) => {
          const dim = active !== null && active !== bar.key;
          return (
            <li key={bar.key}>
              <button
                type="button"
                onPointerEnter={() => setActive(bar.key)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(bar.key)}
                onBlur={() => setActive(null)}
                /*
                  The whole row is the target, not the bar. A branch worth a
                  twentieth of the leader is a few pixels of bar, and a hit
                  area that small is one only a mouse can use.
                */
                className={cn(
                  'flex w-full flex-col gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-2 text-left',
                  'transition-colors hover:bg-[var(--card-inset)]',
                  'focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:outline-none',
                  active === bar.key && 'bg-[var(--card-inset)]',
                )}
                aria-label={`${bar.label}: ${bar.display}, ${Math.round(bar.share * 100)}% of the total`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[0.8125rem] text-[var(--text-primary)]">
                    {bar.label}
                  </span>
                  {/*
                    The figure is printed on every row rather than waiting for
                    a pointer. A value reachable only by hovering is a value
                    nobody using a keyboard, a phone or a printout can read.
                  */}
                  <span className="numeric shrink-0 text-[0.75rem] text-[var(--text-secondary)]">
                    {bar.display}
                  </span>
                </span>

                <span className="flex items-center gap-2">
                  {/* The track, which is what makes a short bar read as short
                      rather than as the whole scale. */}
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--chart-grid)]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${bar.width}%`,
                        background: 'var(--series-1)',
                        opacity: dim ? 0.35 : 1,
                        transition: 'opacity 120ms ease, width 240ms ease',
                      }}
                    />
                  </span>
                  <span
                    className={cn(
                      'numeric w-9 shrink-0 text-right text-[0.6875rem] tabular-nums',
                      active === bar.key
                        ? 'text-[var(--text-secondary)]'
                        : 'text-[var(--text-tertiary)]',
                    )}
                  >
                    {Math.round(bar.share * 100)}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
