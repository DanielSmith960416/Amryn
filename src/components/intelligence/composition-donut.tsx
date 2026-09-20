'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * What a total is made of.
 *
 * ── why a donut here, and not everywhere ──────────────────────────────────
 * A ring is good at one thing: showing that a whole divides into a few parts,
 * at a glance. It is bad at comparing parts that are close, because the eye
 * judges angle poorly — two slices within a few points of each other read as
 * equal however carefully they are drawn. So this is used where the question
 * is "what is this made of", never where it is "which of these is bigger".
 *
 * The rules that follow from that, and are enforced below rather than
 * remembered:
 *
 *   · six segments at most. Past that the small ones are slivers with
 *     nowhere to put a label, so the tail folds into one "Other" and the
 *     rows underneath still name every original part.
 *   · the legend is not a key, it is the table. Every segment's own figure
 *     and share are printed there, so no number is reachable only by
 *     pointing at something — which would make the chart unreadable to
 *     anybody not using a mouse, and unprintable for everybody.
 *   · a 2px gap of the surface colour between segments, rather than a stroke
 *     around each one. A border makes the ring look drawn; a gap makes it
 *     look cut.
 *
 * Pointing at a segment, or focusing it, names it in the middle. The middle
 * is the total until something is singled out, so the default state answers
 * the question the card asks in its title.
 */

export interface Slice {
  /** Stable across renders and filters: the colour follows this, not the order. */
  key: string;
  label: string;
  value: number;
  /** What to print for the value — the caller owns currency and rounding. */
  display: string;
}

const RADIUS = 54;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The cut between segments, in user units of the 120-wide viewBox. */
const GAP = 2;
/*
 * Five arcs at most, because there are only four series colours.
 *
 * This was six, and six was wrong in a way only a picture showed: a seventh
 * branch folded into a tail, the fifth and sixth fell past the end of the
 * four-slot palette onto the grey meant for the tail, and the ring came back
 * with three grey arcs side by side — one of them "everything else" and two of
 * them real places with names. The legend named all three and the ring said
 * they were the same thing.
 *
 * Four named parts, then one tail. Where there are exactly five the fifth
 * takes the grey and keeps its own name in the rows, which is one grey and
 * reads correctly; past that the tail holds two or more.
 */
const MAX_SEGMENTS = 5;

/**
 * The four validated series slots, then the tail colour.
 *
 * Read off CSS custom properties rather than hard-coded, so a theme change
 * moves the chart with everything else. See globals.css for why these are
 * separate tokens from --chart-*.
 */
const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
] as const;
/*
 * The tail, and the one colour here deliberately not doing identity work.
 *
 * It sits below the chroma floor — it is meant to read as grey — and at 2.56:1
 * on a white card it is below the 3:1 a mark is normally held to. That is a
 * debt payable in one of two currencies: visible labels, or a table view. The
 * legend beneath the ring is both, and prints every figure, so it is paid.
 *
 * A darker grey was the obvious fix and is worse: #64748b clears contrast at
 * 4.76:1 and then collapses against slot 4 at ΔE 2.7 under protanopia, which
 * trades a discharged warning for a real failure.
 */
const REST = 'var(--series-rest)';

export interface Segment extends Slice {
  share: number;
  length: number;
  offset: number;
  colour: string;
}

/**
 * Slices to segments: drawn in the caller's order, tail folded, arcs end to end.
 *
 * ── the order is the caller's, and that is the whole point ────────────────
 * The obvious thing is to sort by size, biggest slice first. It was written
 * that way and it was wrong, because colour is then assigned by rank: a branch
 * that slips from second to third next month swaps colour with the one that
 * passed it. Anybody who learned which colour their Cape Town branch is has
 * been misled by a chart that thinks it is being tidy.
 *
 * So the caller supplies the order and it is drawn in that order, and the
 * colour is the position in it. Both callers have an order that means
 * something already — pipeline stages run Active, Evaluating, Planning, which
 * is a sequence and not a ranking, and sorting it by value would scramble it.
 *
 * ── why the fold takes the tail rather than the smallest ──────────────────
 * Same reason. Folding the smallest would let the survivors' positions shift
 * as the figures move, which is rank-assignment wearing a different hat. The
 * tail folds, the ones before it keep their slot, and the rows beneath name
 * every original part regardless.
 *
 * ── and why assignment must never skip ────────────────────────────────────
 * The four series colours are validated as a sequence: each is checked against
 * the one beside it. Slots 2 and 4 are ΔE 0.7 apart under deuteranopia — the
 * same colour to a green-blind reader — so they are safe only because slot 3
 * is always between them. Taking slots 1, 2 and 4 for a three-part chart would
 * put that pair side by side. Assignment therefore runs 1, 2, 3, 4 with no
 * gaps, and the ring's seam — where the last segment meets the first — was
 * checked too: slot 4 against slot 1 is ΔE 14.7, which clears.
 *
 * Zero-valued slices are dropped rather than drawn. An arc of no length is an
 * invisible target sitting exactly on top of its neighbour's, and a legend row
 * reading "0, 0%" tells nobody anything — the caller's own empty state is the
 * honest answer when everything is zero.
 */
export function segmentsFor(slices: Slice[]): Segment[] {
  const present = slices.filter((s) => s.value > 0);
  const total = present.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];

  /*
   * Five parts fit; seven do not, so six become five and a tail — never five
   * and a tail of one, which would label a single category "Other" and lose
   * its name for nothing.
   */
  const folded: Slice[] =
    present.length > MAX_SEGMENTS
      ? [
          ...present.slice(0, MAX_SEGMENTS - 1),
          {
            key: '__rest',
            label: `${present.length - (MAX_SEGMENTS - 1)} more`,
            value: present.slice(MAX_SEGMENTS - 1).reduce((sum, s) => sum + s.value, 0),
            display: '',
          },
        ]
      : present;

  let run = 0;
  return folded.map((slice, i) => {
    const share = slice.value / total;
    const full = share * CIRCUMFERENCE;
    /*
     * The gap is taken out of the segment, not added between them, or the
     * arcs would sum to more than the circle and the last would overlap the
     * first. A segment too small to give up 2px keeps a hairline of itself
     * instead of going negative.
     */
    const length = folded.length > 1 ? Math.max(full - GAP, 0.5) : full;
    const segment: Segment = {
      ...slice,
      share,
      length,
      offset: run,
      colour: slice.key === '__rest' ? REST : (SERIES[i] ?? REST),
    };
    run += full;
    return segment;
  });
}

export function CompositionDonut({
  slices,
  total,
  totalLabel,
  caption,
  size = 168,
  className,
}: {
  slices: Slice[];
  /** Printed in the middle until a segment is singled out. */
  total: string;
  totalLabel: string;
  /** What the ring is a composition of, for a screen reader. */
  caption: string;
  size?: number;
  className?: string;
}) {
  const segments = segmentsFor(slices);
  const [active, setActive] = useState<string | null>(null);
  const titleId = useId();

  if (segments.length === 0) return null;

  const shown = segments.find((s) => s.key === active) ?? null;

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 120 120"
          width={size}
          height={size}
          role="group"
          aria-labelledby={titleId}
          className="-rotate-90"
        >
          <title id={titleId}>{caption}</title>

          {/*
            The track. Without it a ring made of one small segment reads as a
            stray mark rather than as a small part of a whole.
          */}
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--chart-grid)"
            strokeWidth={STROKE}
          />

          {segments.map((seg) => {
            const dim = active !== null && active !== seg.key;
            return (
              <circle
                key={seg.key}
                data-segment={seg.key}
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                stroke={seg.colour}
                strokeWidth={STROKE}
                strokeDasharray={`${seg.length} ${CIRCUMFERENCE}`}
                strokeDashoffset={-seg.offset}
                /*
                  The whole ring is one route to the figures and the rows
                  below are the other, so the segments stay out of the tab
                  order — the rows carry the same labels and are already
                  focusable. Pointing is a shortcut, never the only way in.
                */
                style={{
                  pointerEvents: 'stroke',
                  cursor: 'pointer',
                  opacity: dim ? 0.3 : 1,
                  transition: 'opacity 120ms ease',
                }}
                onPointerEnter={() => setActive(seg.key)}
                onPointerLeave={() => setActive(null)}
              />
            );
          })}
        </svg>

        {/*
          pointer-events-none, and the reason is worth stating: this overlay is
          absolutely positioned across the whole square, so without it the
          readout sits over the ring it describes and swallows every pointer
          event aimed at the segments underneath.
        */}
        {/*
          The figure in the middle wears the page's own sans with proportional
          figures, not the .numeric treatment the rows below use. That class is
          a mono face with equal-width digits, which is right for a column of
          numbers lining up under each other and wrong at 1.375rem standing on
          its own — "R10.4m" comes out visibly gappy, and the mono face reads as
          a different product's typography.
        */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {shown ? (
            /*
             * The figure, not the share.
             *
             * The share was here first and it was the wrong number twice over:
             * the length of the arc already says what proportion this is — that
             * is the entire job of a ring — so printing "60%" in the middle
             * restates the picture, and the row beneath was printing it a second
             * time a centimetre away. The value is the one thing the ring cannot
             * draw, and it keeps the middle in the same units as the total it
             * replaces.
             */
            <>
              <span className="text-[1.375rem] leading-none font-semibold tracking-tight text-[var(--text-primary)] proportional-nums">
                {shown.display || pct(shown.share)}
              </span>
              <span className="mt-1 max-w-[6.5rem] text-[0.6875rem] leading-tight text-[var(--text-secondary)]">
                {shown.label}
              </span>
            </>
          ) : (
            <>
              <span className="text-[1.375rem] leading-none font-semibold tracking-tight text-[var(--text-primary)] proportional-nums">
                {total}
              </span>
              <span className="mt-1 text-[0.6875rem] text-[var(--text-tertiary)]">
                {totalLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {/*
        The legend, which is also the table. Each row is a button so the same
        singling-out is reachable by keyboard, and carries its own figure and
        share so the numbers survive with no pointer, no colour and no chart.
      */}
      <ul className="w-full space-y-1">
        {segments.map((seg) => (
          <li key={seg.key}>
            <button
              type="button"
              onPointerEnter={() => setActive(seg.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(seg.key)}
              onBlur={() => setActive(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left',
                'transition-colors hover:bg-[var(--card-inset)]',
                'focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:outline-none',
                active === seg.key && 'bg-[var(--card-inset)]',
              )}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: seg.colour }}
              />
              <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-[var(--text-primary)]">
                {seg.label}
              </span>
              {seg.display ? (
                <span className="numeric shrink-0 text-[0.75rem] text-[var(--text-secondary)]">
                  {seg.display}
                </span>
              ) : null}
              <span className="numeric w-10 shrink-0 text-right text-[0.75rem] text-[var(--text-tertiary)]">
                {pct(seg.share)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A share, to the nearest whole point — except where that would print 0% for
 * something that is present, which reads as "none" rather than "very little".
 */
export function pct(share: number): string {
  const whole = Math.round(share * 100);
  if (whole === 0 && share > 0) return '<1%';
  return `${whole}%`;
}
