import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import {
  forecastUrl,
  geocodeUrl,
  readConditions,
  readPlace,
  weatherGlyph,
} from '@/lib/weather/open-meteo';

/**
 * Current conditions for one place, fetched by this server rather than by the
 * browser.
 *
 * ── why the server and not the browser ───────────────────────────────────
 * Three reasons, in order of how much they matter:
 *
 *   · Caching. Next caches this fetch for half an hour, so a hundred people in
 *     one company looking at the Command Centre on a Monday morning produce
 *     one request to Open-Meteo rather than a hundred. A free service asked
 *     politely stays free.
 *   · It keeps a third-party host out of the page's connection list, which
 *     matters for a product that will eventually want a strict content policy.
 *   · The geocode and the forecast are two calls; doing them here makes them
 *     one round trip from the browser rather than two.
 *
 * ── why it asks who is calling ───────────────────────────────────────────
 * Without a session check this is an open relay: anybody on the internet could
 * point it at any coordinates and have this server fetch on their behalf, with
 * this server's address and this server's rate limit.
 *
 * In practice a stranger never reaches the check below. The middleware matcher
 * covers /api/weather, so an unauthenticated request is redirected to /sign-in
 * before this function runs — measured, not assumed: a signed-out GET answers
 * 307, not 401. The check stays anyway, and is not decoration. It is the thing
 * that still refuses if the matcher is ever narrowed, if this route is called
 * from somewhere the middleware does not cover, or if a future deployment
 * serves it differently. A route that relies on something else having already
 * refused is a route that stops refusing the day that something else changes.
 *
 * It takes a place, not a person: either `city` (with an optional `country`) or
 * a `lat`/`lon` pair. Nothing here reads the caller's organisation, so this
 * cannot be used to discover where somebody else's business is.
 */

export const dynamic = 'force-dynamic';

/** Half an hour. Weather does not move faster than a dashboard is read. */
const CACHE_SECONDS = 1800;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city')?.trim();
  const country = searchParams.get('country')?.trim() || null;
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));

  let place: { name: string; latitude: number; longitude: number } | null = null;

  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json({ error: 'Those coordinates are not on Earth.' }, { status: 400 });
    }
    // Named "your location" rather than reverse-geocoded: the browser gave a
    // point, and turning it back into a suburb is a second call to learn
    // something the reader already knows.
    place = { name: 'Your location', latitude: lat, longitude: lon };
  } else if (city) {
    const found = await fetchJson(geocodeUrl(city, country));

    // Unreachable is not the same as "no such place", and testing this with
    // the provider genuinely blocked is how that distinction earned its place:
    // a network outage was reporting "No place called Kimberley", which blames
    // the administrator's address for somebody else's downtime. Unreachable is
    // an ordinary empty answer; only a provider that replied and found nothing
    // is a 404 about the city.
    if (found === UNREACHABLE) {
      return NextResponse.json({ place: city, conditions: null });
    }

    const resolved = readPlace(found);
    if (!resolved) {
      return NextResponse.json({ error: `No place called ${city}.` }, { status: 404 });
    }
    place = resolved;
  } else {
    return NextResponse.json({ error: 'Say where.' }, { status: 400 });
  }

  const payload = await fetchJson(forecastUrl(place.latitude, place.longitude));
  const conditions = payload === UNREACHABLE ? null : readConditions(payload);

  if (!conditions) {
    // Deliberately 200 with a null body rather than an error status: the panel
    // asking this question treats "no weather right now" as an ordinary
    // outcome, and an error status would put a red line in the browser console
    // of every reader on a day the provider is having trouble.
    return NextResponse.json({ place: place.name, conditions: null });
  }

  return NextResponse.json({
    place: place.name,
    conditions: { ...conditions, glyph: weatherGlyph(conditions.code) },
  });
}

/**
 * Distinguishes "the provider did not answer" from "the provider answered".
 *
 * One sentinel rather than throwing, because every kind of not-answering — a
 * refused connection, a timeout, a 500, a body that is not JSON — means the
 * same thing to the caller, and it is a different thing from an answer that
 * contained nothing useful.
 */
const UNREACHABLE = Symbol('open-meteo unreachable');

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return UNREACHABLE;
    return await response.json();
  } catch {
    return UNREACHABLE;
  }
}
