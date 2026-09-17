/**
 * Current conditions, from Open-Meteo.
 *
 * ── why this provider ────────────────────────────────────────────────────
 * No key, no account, no per-deployment secret to set or rotate, and free for
 * non-commercial use at the volume a business dashboard produces. Everything
 * else considered wanted an API key, which means one more variable that a
 * fresh deployment gets wrong and one more thing to keep out of the bundle.
 *
 * ── what is honest about this file ───────────────────────────────────────
 * The endpoints and field names below are from Open-Meteo's documented API. I
 * could not reach api.open-meteo.com from the machine this was written on —
 * the network there refuses it — so the shapes are asserted against recorded
 * fixtures rather than against a live response.
 *
 * That is exactly why every reader below is defensive. If a field is named
 * differently, or a number arrives as a string, or the payload changes shape
 * entirely, these return null and the panel says the weather is unavailable.
 * A dashboard that loses its weather tile is a small disappointment; one that
 * throws while rendering because a third party renamed a field is an outage.
 */

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export interface Conditions {
  temperature: number;
  code: number;
  description: string;
}

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export function geocodeUrl(city: string, countryCode?: string | null): string {
  const url = new URL(GEOCODING);
  url.searchParams.set('name', city);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  // Narrows "Kimberley" to the one in South Africa rather than the ones in
  // Australia and Canada. The organisation already carries a country code.
  if (countryCode) url.searchParams.set('countryCode', countryCode);
  return url.toString();
}

export function forecastUrl(latitude: number, longitude: number): string {
  const url = new URL(FORECAST);
  // Trimmed to three decimals — a hundred metres or so. More precision in a
  // URL is both useless for weather and a needlessly exact record of where
  // somebody is standing, and it makes the cache key vary per reader.
  url.searchParams.set('latitude', latitude.toFixed(3));
  url.searchParams.set('longitude', longitude.toFixed(3));
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('timezone', 'auto');
  return url.toString();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readPlace(payload: unknown): Place | null {
  const results = (payload as { results?: unknown[] } | null)?.results;
  const first = Array.isArray(results) ? results[0] : null;
  if (!first || typeof first !== 'object') return null;

  const row = first as Record<string, unknown>;
  const latitude = asNumber(row.latitude);
  const longitude = asNumber(row.longitude);
  const name = typeof row.name === 'string' ? row.name : null;
  if (latitude === null || longitude === null || !name) return null;

  return {
    name,
    latitude,
    longitude,
    country: typeof row.country === 'string' ? row.country : undefined,
    admin1: typeof row.admin1 === 'string' ? row.admin1 : undefined,
  };
}

export function readConditions(payload: unknown): Conditions | null {
  const current = (payload as { current?: unknown } | null)?.current;
  if (!current || typeof current !== 'object') return null;

  const row = current as Record<string, unknown>;
  const temperature = asNumber(row.temperature_2m);
  const code = asNumber(row.weather_code);
  if (temperature === null || code === null) return null;

  return { temperature, code, description: describeWeather(code) };
}

/**
 * WMO weather codes, in words.
 *
 * Open-Meteo reports the WMO 4677 code rather than a description, so the words
 * are ours. They are deliberately plain — "Light rain", not "Slight rain
 * showers (intensity 1)" — because this is a line on a dashboard beside a
 * temperature, read at a glance by somebody who is here to look at their
 * margins.
 *
 * An unknown code returns "Unknown" rather than throwing: the list of codes is
 * a standard, but a standard is still somebody else's list.
 */
export function describeWeather(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing drizzle';
  if (code === 61) return 'Light rain';
  if (code === 63) return 'Rain';
  if (code === 65) return 'Heavy rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code === 80) return 'Light showers';
  if (code === 81) return 'Showers';
  if (code === 82) return 'Heavy showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return 'Unknown';
}

/**
 * A single character standing in for the sky.
 *
 * Emoji rather than an icon set: three of these appear on one line beside a
 * temperature, and pulling in an icon dependency to draw a cloud would cost
 * more than the whole feature. They are decorative and always paired with the
 * words above, so a font that renders them poorly loses nothing.
 */
export function weatherGlyph(code: number): string {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌦️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code === 85 || code === 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}
