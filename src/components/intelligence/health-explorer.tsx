'use client';

import { useState } from 'react';
import { Badge, HEALTH_TONE } from '@/components/ui/badge';
import type { HealthComponent, HealthScore } from '@/lib/intelligence/types';
import { percent, score as fmtScore } from '@/lib/format';

/**
 * The Business Health Score, and what it is made of.
 *
 * ── why this is a new component rather than an edit ──────────────────────
 * HealthDial used to render on the Command Centre on its own, with no
 * breakdown beside it and nothing to link to. Teaching it about a list it did
 * not always have would have made every caller carry the cost of one caller's
 * feature, so this was written beside it instead.
 *
 * The Command Centre now renders this too, with breakdown={false} — a dial
 * that answers, without the eight rows its rail has no room for. That leaves
 * health-dial.tsx with no callers. It is left in place rather than deleted:
 * it is the marketing site's dial, carried over for parity, and removing a
 * working component is a decision for whoever owns that parity rather than
 * for the change that happened to make it idle.
 *
 * ── the arithmetic that was missing ──────────────────────────────────────
 * The breakdown showed each component as "82 × 15%" and never the product.
 * That product is the entire point: it is how many of the 73 points on the
 * dial that component actually put there, and it was the one number on the
 * card a reader could not get. Eight rows of raw scores do not add up to the
 * total, so the list read as unrelated to the dial above it.
 *
 * Pointing at a row does three things at once: the dial's centre becomes that
 * component's contribution, an arc on the ring shows the share of the total it
 * occupies, and the row states the multiplication. Pointing at the ring does
 * the same in reverse — each component's arc carries its own hit band, so the
 * picture answers as readily as the list does.
 *
 * ── the ring was decoration for a day ────────────────────────────────────
 * It said all of the above from the start and only half of it was built: the
 * rows responded and the ring did not, which made the dial a picture of the
 * interaction rather than part of it. Two things were in the way, and the
 * second is why it could not have worked by accident — the centre readout is
 * an absolutely positioned overlay across the whole square, so it sat over the
 * ring and swallowed every pointer event aimed at it. It is pointer-events:
 * none now, and the arcs beneath it are reachable.
 *
 * The hit bands are pointer-only and stay outside the tab order. Every one of
 * them has a row below carrying the same figures, already focusable and
 * already announced; a second tab stop per component would be eight more stops
 * to reach the same eight answers.
 *
 * ── what it does not do ──────────────────────────────────────────────────
 * It does not recompute anything. weightedScore is already on every component
 * — BUSINESS_HEALTH!G5:G12, raw × weight — so this shows a figure the model
 * has always carried rather than one this file worked out.
 */

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STROKE: Record<string, string> = {
  EXCELLENT: 'var(--positive)',
  HEALTHY: 'var(--positive)',
  STABLE: 'var(--info)',
  WEAK: 'var(--warning)',
  CRITICAL: 'var(--negative)',
};

export interface Segment {
  component: string;
  /** Length of this component's arc, in the dial's stroke units. */
  length: number;
  /** How far round the ring this component's arc begins. */
  offset: number;
  derived: boolean;
}

/**
 * Where each component's contribution sits on the ring.
 *
 * The arcs are laid end to end in the order the components come in, so
 * together they span exactly the filled part of the dial — the same arc the
 * score has always drawn, now divisible. A component contributing 12.3 of 73
 * points occupies 12.3/100 of the circumference, because the dial is a
 * percentage and the contributions are percentage points of it.
 */
/**
 * What a component says to somebody who cannot see the ring.
 *
 * One function because two controls use it — the rows when the breakdown is
 * shown, the ring's bands when it is not — and a component announced two
 * different ways depending on which page it is on is two things to keep
 * right instead of one.
 */
function labelFor(c: HealthComponent): string {
  return (
    `${c.component}: ${fmtScore(c.rawScore, 0)} of 100, weighted ${percent(c.weight, 0)}, ` +
    `contributing ${fmtScore(c.weightedScore, 1)} points. ${c.description}`
  );
}

export function segmentsFor(components: HealthComponent[]): Segment[] {
  let run = 0;
  return components.map((c) => {
    const length = (Math.max(0, c.weightedScore) / 100) * CIRCUMFERENCE;
    const segment: Segment = { component: c.component, length, offset: run, derived: c.derived };
    run += length;
    return segment;
  });
}

export function HealthExplorer({
  health,
  size = 148,
  /**
   * Whether the eight rows are shown beneath the dial.
   *
   * The Digital Twin has room for them; the Command Centre's side rail does
   * not, and a second copy of the same eight rows on the page that links to
   * the first is not a summary.
   *
   * It also decides where the keyboard route lives, which is the part that
   * matters. With the list, the rows are focusable and the ring's bands are
   * pointer-only — eight more tab stops would reach the same eight answers.
   * Without it, the ring is the only route there is, so the bands take the
   * tab stops and the readout beneath states what a row would have.
   */
  breakdown = true,
}: {
  health: HealthScore;
  size?: number;
  breakdown?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);

  const filled = (Math.min(100, Math.max(0, health.overall)) / 100) * CIRCUMFERENCE;
  const segments = segmentsFor(health.components);
  const shown = health.components.find((c) => c.component === active) ?? null;
  const shownSegment = segments.find((s) => s.component === active) ?? null;

  return (
    <div>
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          {/*
            aria-hidden only while the rows carry the semantics. With the
            bands focusable it must not be — a control that takes focus inside
            hidden content is reachable by tab and announced as nothing.
          */}
          <svg
            viewBox="0 0 120 120"
            className="size-full -rotate-90"
            aria-hidden={breakdown || undefined}
            role={breakdown ? undefined : 'group'}
            aria-label={breakdown ? undefined : 'Business Health Score, by component'}
          >
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--card-inset)" strokeWidth="9" />
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke={STROKE[health.status] ?? 'var(--info)'}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
              // Dimmed while a component is singled out, so the highlighted
              // arc reads as part of this one rather than as a second ring.
              opacity={shownSegment ? 0.25 : 1}
              style={{ transition: 'opacity 140ms ease-out' }}
            />
            {/*
              The hovered component's share of the ring. Butt-capped rather
              than round: a rounded cap would overhang the arc either side and
              make a small contribution look larger than it is.

              Always the brand colour, never the bar's. Colouring an assumed
              component's arc in grey — as the bars below do — put a faint grey
              segment on a dimmed ring, and Strategic's six points became
              almost impossible to find. This colour says "this is the one you
              are pointing at", which is true of every component; whether the
              figure is measured or assumed is the row's job to say, and it
              does, twice.
            */}
            {shownSegment ? (
              <circle
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                stroke="var(--brand)"
                strokeWidth="9"
                strokeDasharray={`${shownSegment.length} ${CIRCUMFERENCE}`}
                strokeDashoffset={-shownSegment.offset}
              />
            ) : null}

            {/*
              One invisible band per component, last so nothing is drawn over
              them. Wider than the ring they cover — a component contributing
              six points is about nine pixels of arc, and a band the width of
              the stroke would be a target only a mouse could hit.

              pointerEvents: 'stroke' so the band catches along the arc and the
              disc inside it stays inert; without it the circle's fill area
              would take every event in the middle of the dial.

              Where these take focus, what shows it is the arc lighting and the
              readout changing — not an outline. An outline on a circle of this
              radius is a box around the whole dial, drawn identically for all
              six stops, which says a control has focus and not which one.
            */}
            {segments.map((seg) =>
              seg.length > 0 ? (
                <circle
                  key={seg.component}
                  data-segment={seg.component}
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  {...(breakdown
                    ? {}
                    : {
                        tabIndex: 0,
                        role: 'button',
                        'aria-label': labelFor(
                          health.components.find((c) => c.component === seg.component)!,
                        ),
                        onFocus: () => setActive(seg.component),
                        onBlur: () =>
                          setActive((current) => (current === seg.component ? null : current)),
                      })}
                  strokeDasharray={`${seg.length} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-seg.offset}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerEnter={() => setActive(seg.component)}
                  onPointerLeave={() =>
                    setActive((current) => (current === seg.component ? null : current))
                  }
                />
              ) : null,
            )}
          </svg>

          {/*
            pointer-events-none, or this overlay covers the ring it sits inside
            and the arcs below never see a pointer at all.
          */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {/*
              The page's own sans with proportional figures, not .numeric.
              That class is a mono face with equal-width digits — right for a
              column of numbers lining up under each other, wrong at two rem
              standing alone, where "70.8" comes out visibly gappy and in a
              typeface nothing else on the card uses. The same fix the
              composition ring needed; this dial sits beside it in the same
              row, so the two were visibly disagreeing.
            */}
            <span className="text-[2rem] leading-none font-semibold tracking-tight text-[var(--text-primary)] proportional-nums">
              {shown ? fmtScore(shown.weightedScore, 1) : fmtScore(health.overall)}
            </span>
            <span className="numeric text-[0.75rem] text-[var(--text-tertiary)]">
              {shown ? 'points' : '/100'}
            </span>
          </div>
        </div>

        {/*
          The status badge is about the whole score, so while a component is
          singled out it gives way to that component.

          Without the breakdown below, this line is the only place the
          multiplication can appear, so it carries it. With the breakdown, the
          row states it and repeating it here would be the same sum twice.
          Fixed height either way, so the card does not resize under the
          pointer.
        */}
        <div
          className={
            'mt-3 flex flex-col items-center ' + (breakdown ? 'min-h-[1.75rem]' : 'min-h-[3rem]')
          }
        >
          {shown ? (
            <>
              <span className="max-w-full truncate text-[0.8125rem] text-[var(--text-secondary)]">
                {shown.component.replace(' Health', '')}
              </span>
              {/*
                The sum, without its answer. The centre of the dial is already
                showing the product in two-rem type directly above this, and
                "82 × 25% = 20.5" under a 20.5 is the same number twice, a
                centimetre apart. The line states the working and the dial
                states the result.
              */}
              {!breakdown ? (
                <span className="numeric mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
                  {fmtScore(shown.rawScore, 0)} × {percent(shown.weight, 0)}
                  {!shown.derived ? ' · assumed' : ''}
                </span>
              ) : null}
            </>
          ) : (
            <Badge tone={HEALTH_TONE[health.status]}>{health.status}</Badge>
          )}
        </div>
      </div>

      {breakdown ? (
      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <ul className="space-y-2.5">
          {health.components.map((c) => {
            const isActive = c.component === active;
            return (
              <li
                key={c.component}
                onPointerEnter={() => setActive(c.component)}
                onPointerLeave={() =>
                  setActive((current) => (current === c.component ? null : current))
                }
                className="rounded-[var(--radius-control)] transition-opacity"
                style={{ opacity: active && !isActive ? 0.45 : 1 }}
              >
                {/*
                  A button rather than a bare row: this is the same information
                  on focus as on hover, and the list is the only route to it
                  for anybody not using a pointer.
                */}
                <button
                  type="button"
                  onFocus={() => setActive(c.component)}
                  onBlur={() => setActive((current) => (current === c.component ? null : current))}
                  aria-label={labelFor(c)}
                  className="block w-full cursor-default text-left"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[0.8125rem] text-[var(--text-primary)]">
                      {c.component.replace(' Health', '')}
                      {!c.derived ? (
                        <span
                          className="ml-1.5 text-[0.6875rem] text-[var(--text-tertiary)]"
                          title="A standing assessment, not a measurement from connected data."
                        >
                          assumed
                        </span>
                      ) : null}
                    </span>
                    <span className="numeric shrink-0 text-[0.8125rem] text-[var(--text-secondary)]">
                      {fmtScore(c.rawScore, 0)}
                      <span className="text-[var(--text-tertiary)]"> × {percent(c.weight, 0)}</span>
                      {/*
                        The product, which is what this component actually puts
                        on the dial. Shown on the row being pointed at rather
                        than on all eight, because eight of these at once is a
                        second column of numbers nobody asked for.
                      */}
                      {isActive ? (
                        <span className="font-semibold text-[var(--text-primary)]">
                          {' '}= {fmtScore(c.weightedScore, 1)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--card-inset)]">
                    <div
                      className="h-full rounded-[var(--radius-pill)]"
                      style={{
                        width: `${Math.min(100, Math.max(0, c.rawScore))}%`,
                        background: c.derived ? 'var(--brand)' : 'var(--border-strong)',
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {/*
          What the hovered component measures, in the model's own words. Fixed
          height so the card does not resize as the pointer moves down the list.
        */}
        <p className="mt-3 min-h-[2.5rem] text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          {shown
            ? shown.description
            : 'Components marked assumed are standing assessments rather than measurements from connected data.'}
        </p>
      </div>
      ) : null}
    </div>
  );
}
