'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock } from '@/components/shell/clock';

interface Reading {
  place: string;
  conditions: { temperature: number; description: string; glyph: string } | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; reading: Reading }
  | { kind: 'ask' }
  | { kind: 'none' };

const CACHE_KEY = 'amryn.weather';
const CACHE_MS = 15 * 60 * 1000;

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
 * ── the cache ────────────────────────────────────────────────────────────
 * Answers are kept for fifteen minutes in this browser, so moving between
 * pages does not re-ask. The server caches for thirty on top of that, so the
 * provider sees one request per city per half hour however many people are
 * looking. Weather does not move faster than a dashboard is read.
 */
export function WeatherPanel({
  city,
  countryCode,
}: {
  city: string | null;
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
    const query = new URLSearchParams({ city, ...(countryCode ? { country: countryCode } : {}) });
    void load(query.toString());
  }, [city, countryCode, load]);

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
      { timeout: 8000, maximumAge: 15 * 60 * 1000 },
    );
  }, [load]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--card-inset)] px-4 py-2.5">
      <Clock className="text-[0.8125rem]" />

      <div className="text-[0.8125rem] text-[var(--text-secondary)]">
        {state.kind === 'loading' ? <span className="text-[var(--text-tertiary)]">…</span> : null}

        {state.kind === 'ready' && state.reading.conditions ? (
          <span className="flex items-center gap-2">
            <span aria-hidden>{state.reading.conditions.glyph}</span>
            <span className="font-mono tabular-nums text-[var(--text-primary)]">
              {Math.round(state.reading.conditions.temperature)}°C
            </span>
            <span>{state.reading.conditions.description}</span>
            <span className="text-[var(--text-tertiary)]">· {state.reading.place}</span>
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
