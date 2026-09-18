'use client';

import { useId, useState } from 'react';
import { money, percent, score } from '@/lib/format';
import type { ScoredOpportunity } from '@/lib/intelligence/types';

/**
 * The OpportunityRadar® dial, carried over from the marketing site.
 *
 * The encoding is the marketing site's, and it is worth stating because it is
 * what makes the picture readable at a glance:
 *
 *   · distance from the centre  = how soon it closes (urgent sits at the centre)
 *   · dot size                  = revenue at stake
 *   · angle                     = nothing. It only separates the dots.
 *
 * Angle carries no meaning deliberately. Giving it one — category, say — would
 * imply a spatial relationship between "New Product" and "Cross-Sell" that does
 * not exist.
 *
 * ── what this component used to be ───────────────────────────────────────
 * A picture, and nothing else. The only way to find out which dot was which
 * was an SVG <title>, which is a native tooltip: it needs a mouse to hover and
 * a second of patience, so on a phone — where this was reported from — the
 * radar was completely inert. Six dots, no labels, no way to ask any of them
 * anything.
 *
 * ── and what it is now ───────────────────────────────────────────────────
 * Every blip is a link to its own card in the list beside the dial, with a hit
 * area far larger than the dot it belongs to. Pointing at one, tabbing to one
 * or tapping one names it and states its figures underneath; activating one
 * jumps to the card, which carries the full scoring breakdown.
 *
 * Nothing here is the only way to reach a number. The list below the dial has
 * every value on it, so this is a faster route to them and never a gate in
 * front of them.
 */

/** One revolution of the sweep. Slow enough to read past, fast enough to notice. */
const SWEEP_SECONDS = 6;

/** The golden angle, which spreads any number of dots without clustering. */
const GOLDEN_ANGLE = 2.39996;

const CENTRE = 150;
const RIM = 132;
const HUB = 18;
const TAU = Math.PI * 2;

export interface Blip {
  id: string;
  title: string;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  /** Where in one revolution the sweep reaches this blip, as 0–1. */
  ping: number;
  opportunity: ScoredOpportunity;
}

/**
 * Where every dot sits, how big it is and when the sweep reaches it.
 *
 * Separated from the rendering so the geometry can be asserted on directly.
 * It is the part of this component that can be quietly wrong — a dot in the
 * wrong ring is still a plausible-looking picture — and the part a reader has
 * no way to check.
 */
export function blipsFor(opportunities: ScoredOpportunity[]): Blip[] {
  /*
   * The floor of 1 is what keeps a workbook of unvalued opportunities from
   * dividing by zero. Every dot then reads as the smallest size, which is the
   * honest picture of six opportunities nobody has priced.
   */
  const maxValue = Math.max(1, ...opportunities.map((o) => o.estValue));

  return opportunities.map((o, i) => {
    // Urgency 1 sits at the centre, urgency 0 at the rim.
    const radius = HUB + (1 - o.urgency) * (RIM - HUB);
    const turn = i * GOLDEN_ANGLE;
    const angle = turn - Math.PI / 2;

    /*
     * When the sweep reaches this blip, as a fraction of one revolution.
     * The sweep starts at twelve o'clock and the first blip sits there, so
     * blip 0 answers as the animation begins and the rest follow their own
     * angles. Computed from the angle rather than staggered by index: a delay
     * of "i × something" would have dots answering in a sequence the picture
     * does not show.
     */
    const wrapped = ((turn % TAU) + TAU) % TAU;

    return {
      id: o.id,
      title: o.title,
      cx: CENTRE + radius * Math.cos(angle),
      cy: CENTRE + radius * Math.sin(angle),
      r: 4 + Math.sqrt(o.estValue / maxValue) * 9,
      fill:
        o.classification === 'HIGH'
          ? 'var(--positive)'
          : o.classification === 'MEDIUM'
            ? 'var(--info)'
            : 'var(--text-tertiary)',
      ping: wrapped / TAU,
      opportunity: o,
    };
  });
}

export function OpportunityDial({
  opportunities,
  size = 300,
  currency = 'ZAR',
}: {
  opportunities: ScoredOpportunity[];
  size?: number;
  currency?: string;
}) {
  const centre = CENTRE;
  const labelId = useId();

  /*
   * Which blip is being pointed at, tabbed to or tapped. One piece of state
   * rather than per-blip, because two readouts at once is a picture of two
   * opportunities and an answer to neither.
   */
  const [active, setActive] = useState<string | null>(null);

  const blips = blipsFor(opportunities);

  const shown = blips.find((b) => b.id === active)?.opportunity ?? null;

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 300 300"
        style={{ width: size, maxWidth: '100%', height: 'auto' }}
        // Not role="img": that would collapse the whole dial into one label
        // and hide the links inside it from anybody navigating by keyboard or
        // screen reader — which is the half of this change that matters most.
        role="group"
        aria-labelledby={labelId}
      >
        <title id={labelId}>
          {`Opportunity radar, ${opportunities.length} ${opportunities.length === 1 ? 'opportunity' : 'opportunities'}. Distance from the centre is how soon each closes; dot size is revenue at stake. Each is a link to its full entry.`}
        </title>

        <g stroke="var(--border)" fill="none" strokeWidth="1">
          <circle cx={centre} cy={centre} r="140" />
          <circle cx={centre} cy={centre} r="100" />
          <circle cx={centre} cy={centre} r="60" />
          <circle cx={centre} cy={centre} r="22" />
          <line x1={centre} y1="10" x2={centre} y2="290" />
          <line x1="10" y1={centre} x2="290" y2={centre} />
        </g>

        {/*
          The sweep turns now.

          It used to be a static wedge, on the reasoning that a dashboard which
          pulses forever is a dashboard people stop looking at. That reasoning
          still holds and this is built against it: one slow revolution every
          six seconds, the wedge at 7% and its leading edge at 30%, and each
          blip answering for two thirds of a second as the edge crosses it
          rather than throbbing on its own clock. Nothing moves that a reader
          has to wait for, and nothing that carries a value moves at all.

          Under prefers-reduced-motion the global rule in globals.css stops
          every animation on the page, and this comes to rest as the wedge it
          was before.
        */}
        <g className="amryn-dial-sweep">
          <path
            d={`M${centre} ${centre} L${centre} 10 A140 140 0 0 1 249 51 Z`}
            fill="var(--brand)"
            opacity="0.07"
          />
          <line
            x1={centre}
            y1={centre}
            x2="249"
            y2="51"
            stroke="var(--brand)"
            strokeWidth="1.5"
            opacity="0.3"
          />
        </g>

        {blips.map((b) => {
          const isActive = b.id === active;
          return (
            <a
              key={b.id}
              href={`#opportunity-${b.id}`}
              aria-label={`${b.title}. ${money(b.opportunity.estValue, currency)}, scored ${score(b.opportunity.score, 0)} of 100, ${b.opportunity.classification}.`}
              onPointerEnter={() => setActive(b.id)}
              onPointerLeave={() => setActive((current) => (current === b.id ? null : current))}
              onFocus={() => setActive(b.id)}
              onBlur={() => setActive((current) => (current === b.id ? null : current))}
              className="cursor-pointer outline-none"
            >
              {/* The return as the sweep passes. Behind the dot, never over it. */}
              <circle
                className="amryn-dial-ping"
                cx={b.cx}
                cy={b.cy}
                r={b.r}
                fill="none"
                stroke={b.fill}
                strokeWidth="1.5"
                style={{ animationDelay: `${(b.ping * SWEEP_SECONDS).toFixed(2)}s` }}
              />

              <circle
                cx={b.cx}
                cy={b.cy}
                r={isActive ? b.r + 2.5 : b.r}
                fill={b.fill}
                opacity={active && !isActive ? 0.3 : 0.85}
                // A ring in the surface colour, so a lifted dot separates from
                // whatever it is sitting on top of.
                stroke="var(--card)"
                strokeWidth={isActive ? 2 : 0}
                style={{ transition: 'r 120ms ease-out, opacity 120ms ease-out' }}
              />

              {/*
                The hit target, which is not the dot.

                A 4px dot is a pinpoint on a desktop and unhittable with a
                thumb. This is 24px across whatever the dot underneath is
                doing, which is the smallest target a finger finds reliably.
              */}
              <circle cx={b.cx} cy={b.cy} r={Math.max(12, b.r + 8)} fill="transparent" />
            </a>
          );
        })}
      </svg>

      {/*
        The caption and the readout share one slot, at a fixed height so that
        pointing at a blip does not shift the page under the pointer.

        Idle it is the key to the encoding, which is the thing a reader needs
        before they have picked anything. Active it is that opportunity's
        figures, value first: whoever is pointing at a dot already knows which
        dot it is and wants the number.
      */}
      <figcaption className="mt-2 min-h-[3.5rem] text-[0.75rem] leading-snug">
        {shown ? (
          <span className="block">
            <span className="numeric text-[0.9375rem] font-semibold text-[var(--text-primary)]">
              {money(shown.estValue, currency)}
            </span>
            <span className="numeric ml-2 text-[var(--text-secondary)]">
              {score(shown.score, 0)}/100 · {shown.classification}
            </span>
            <span className="mt-0.5 block text-[var(--text-secondary)]">{shown.title}</span>
            <span className="numeric mt-0.5 block text-[var(--text-tertiary)]">
              {percent(shown.urgency, 0)} urgency · {percent(shown.probability, 0)} probability
            </span>
          </span>
        ) : (
          <span className="block text-[var(--text-tertiary)]">
            Distance from centre = how soon it closes. Dot size = revenue at stake.
            {/*
              A dot does not look like a control, so the one line that says it
              is one earns its place. Mode-neutral: "point at" is wrong on a
              phone and "tap" is wrong on a desktop, and this was reported from
              a phone.
            */}
            <span className="mt-0.5 block">Each blip opens its entry.</span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
