'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock } from '@/components/shell/clock';

interface Reading {
  place: string;
  conditions: {
    temperature: number;
    apparent: number | null;
    description: string;
    glyph: string;
    isDay: boolean;
    observedAt: string | null;
  } | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; reading: Reading }
  | { kind: 'ask' }
  | { kind: 'none' };

const CACHE_KEY = 'amryn.weather';

/*
 * Ten minutes in this browser, under the server's fifteen.
 *
 * It was fifteen here as well, which stacked: a reader could hold an answer
 * that the server had itself been holding, and a temperature nearly an hour
 * old read exactly like one taken now. Sitting under the server's window means
 * the worst case is bounded by the server's, and the line below states the
 * observation time whenever it has drifted from the clock beside it.
 */
const CACHE_MS = 10 * 60 * 1000;

/**
 * How far the feels-like has to be from the air temperature to be worth saying.
 *
 * Under two degrees it is the same sentence with more words in it. Over two —
 * a dry Northern Cape afternoon, or anywhere with wind — it is the number a
 * person would actually give if you asked them how warm it was.
 */
const APPARENT_GAP = 2;

/** Past this, the reading is old enough that the reader should be told when. */
const STALE_MINUTES = 20;

/**
 * The time, and what it is doing outside.
 *
 * ── where the place comes from, in order ─────────────────────────────────
 *   1. The organisation's city, if an administrator has filled the trading
 *      address in. Nothing is asked of the reader and nothing about them is
 *      used — every colleague sees the same tile, which is right, because it
 *      is the business's weather.
 *   2. Otherwise the browser's location, and only if the reader presses the
 *      button. A permission prompt that appears unbidden on a dashboard is
 *      the kind of thing people click "block" on forever, and then the tile
 *      can never work even after they would have said yes.
 *   3. Otherwise nothing but a quiet line saying where to set it.
 *
 * The province goes with the city, because two towns in one country can share
 * a name and the largest is not always the right one.
 *
 * ── the cache, and saying how old a reading is ───────────────────────────
 * Answers are kept for ten minutes in this browser and fifteen on the server,
 * so the provider sees one request per place per quarter of an hour however
 * many people are looking. The two used to be fifteen apiece and stacked, and
 * a reading nearly an hour old looked exactly like one taken now.
 *
 * They still stack a little, which is why the reading carries the provider's
 * own observation time and says it once that time is more than twenty minutes
 * behind the clock sitting next to it. A cache that protects a free provider
 * is worth keeping; a number that hides its age is not.
 */
export function WeatherPanel({
  city,
  province,
  countryCode,
}: {
  city: string | null;
  province?: string | null;
  countryCode: string | null;
}) {
  const [state, setState] = useState<State>(city ? { kind: 'loading' } : { kind: 'ask' });

  const load = useCallback(async (query: string) => {
    try {
      const cached = readCache(query);
      if (cached) {
        setState({ kind: 'ready', reading: cached });
        return;
      }

      const response = await fetch(`/api/weather?${query}`);
      if (!response.ok) {
        setState({ kind: 'none' });
        return;
      }
      const reading = (await response.json()) as Reading;
      writeCache(query, reading);
      setState({ kind: 'ready', reading });
    } catch {
      setState({ kind: 'none' });
    }
  }, []);

  useEffect(() => {
    if (!city) return;
    const query = new URLSearchParams({
      city,
      ...(countryCode ? { country: countryCode } : {}),
      ...(province ? { province } : {}),
    });
    void load(query.toString());
  }, [city, province, countryCode, load]);

  const askBrowser = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ kind: 'none' });
      return;
    }
    setState({ kind: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const query = new URLSearchParams({
          lat: position.coords.latitude.toFixed(3),
          lon: position.coords.longitude.toFixed(3),
        });
        void load(query.toString());
      },
      // Refused, unavailable, or timed out — all the same to the reader, who
      // asked for the weather and is not getting it.
      () => setState({ kind: 'none' }),
      /*
       * A quarter of an hour of tolerance was enough to hand back a fix from
       * a different town — somebody who drove to work between opening the
       * dashboard twice got yesterday's suburb. Five minutes, and high
       * accuracy asked for: this fires once, on a button the reader pressed,
       * so the battery argument against it does not apply here.
       */
      { timeout: 8000, maximumAge: 5 * 60 * 1000, enableHighAccuracy: true },
    );
  }, [load]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--card-inset)] px-4 py-2.5">
      <Clock className="text-[0.8125rem]" />

      <div className="text-[0.8125rem] text-[var(--text-secondary)]">
        {state.kind === 'loading' ? <span className="text-[var(--text-tertiary)]">…</span> : null}

        {state.kind === 'ready' && state.reading.conditions ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span aria-hidden>{state.reading.conditions.glyph}</span>
            <span className="font-mono tabular-nums text-[var(--text-primary)]">
              {Math.round(state.reading.conditions.temperature)}°C
            </span>
            {/*
              Only when it is a different answer. "18°C, feels like 18°C" is
              two numbers saying one thing, and a tile that repeats itself is
              a tile people stop reading.
            */}
            {feelsLike(state.reading.conditions) !== null ? (
              <span className="font-mono tabular-nums text-[var(--text-tertiary)]">
                feels {feelsLike(state.reading.conditions)}°
              </span>
            ) : null}
            <span>{state.reading.conditions.description}</span>
            <span className="text-[var(--text-tertiary)]">· {state.reading.place}</span>
            {/*
              The age of the reading, and only once it has one worth stating.
              A temperature with no time on it claims to be now.
            */}
            {observedLabel(state.reading.conditions.observedAt) ? (
              <span className="text-[var(--text-tertiary)]">
                · {observedLabel(state.reading.conditions.observedAt)}
              </span>
            ) : null}
          </span>
        ) : null}

        {state.kind === 'ready' && !state.reading.conditions ? (
          <span className="text-[var(--text-tertiary)]">Weather unavailable</span>
        ) : null}

        {state.kind === 'ask' ? (
          <button
            type="button"
            onClick={askBrowser}
            className="text-[var(--brand)] underline underline-offset-2 hover:no-underline"
          >
            Show local weather
          </button>
        ) : null}

        {state.kind === 'none' ? (
          <span className="text-[var(--text-tertiary)]">Weather unavailable</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The feels-like, rounded, or null where it is not worth a second number.
 *
 * Exported-shaped as a plain function rather than inlined so the threshold
 * lives in one place and can be asserted on.
 */
export function feelsLike(conditions: {
  temperature: number;
  apparent: number | null;
}): number | null {
  if (conditions.apparent === null) return null;
  const air = Math.round(conditions.temperature);
  const felt = Math.round(conditions.apparent);
  /*
   * The second test is unreachable while APPARENT_GAP is 2 — a gap of two or
   * more degrees cannot round to one. It stays because the thing being
   * protected is the printed line, not the gap: if the threshold is ever
   * lowered, "18°C feels 18°" starts appearing and nothing else would stop it.
   */
  return Math.abs(conditions.apparent - conditions.temperature) >= APPARENT_GAP && felt !== air
    ? felt
    : null;
}

/**
 * "as at 19:10", once the reading is far enough behind the clock to matter.
 *
 * Open-Meteo sends `current.time` in the location's own timezone and without
 * an offset — "2026-09-17T19:00". Parsing that with the Date constructor would
 * read it as local time for whoever is looking, which is right for a business
 * reading its own city's weather and wrong for anybody travelling. The minutes
 * are therefore taken from the string itself rather than through a Date, and
 * the comparison is against the reader's own clock only to decide whether to
 * say anything at all.
 *
 * Anything unparseable returns null and the tile simply says nothing, which is
 * what it did before.
 */
export function observedLabel(observedAt: string | null, now = new Date()): string | null {
  if (!observedAt) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(observedAt);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const taken = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  if (Number.isNaN(taken.getTime())) return null;

  const minutesOld = (now.getTime() - taken.getTime()) / 60000;
  // A reading from the future is a clock disagreement, not news. Say nothing.
  if (minutesOld < STALE_MINUTES) return null;

  return `as at ${hour}:${minute}`;
}

/**
 * Both wrapped, because localStorage throws outright rather than returning
 * null in some privacy configurations, and a weather tile is not worth taking
 * a dashboard down for.
 */
function readCache(query: string): Reading | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${query}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; reading: Reading };
    if (!parsed?.at || Date.now() - parsed.at > CACHE_MS) return null;
    return parsed.reading ?? null;
  } catch {
    return null;
  }
}

function writeCache(query: string, reading: Reading): void {
  try {
    localStorage.setItem(`${CACHE_KEY}:${query}`, JSON.stringify({ at: Date.now(), reading }));
  } catch {
    // Not being able to remember costs one extra request later.
  }
}
