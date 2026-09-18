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
 *
 * ── what was wrong with the first version ────────────────────────────────
 * Reported as "it isn't accurate enough", and it was wrong in four separate
 * ways, none of which announced itself:
 *
 *   · The place was whatever the geocoder ranked first for the city name.
 *     The organisation's province was stored and never asked for, so a
 *     business in a country with two towns of one name got a coin flip.
 *   · A clear sky at nine in the evening drew a blazing sun. The API reports
 *     is_day and nothing here asked for it.
 *   · The temperature was the air temperature. On a still afternoon in the
 *     Northern Cape that is several degrees off what anybody standing in it
 *     would call the temperature.
 *   · The reading carried no time. Between the two caches it could be the
 *     better part of an hour old and read as though it were now.
 *
 * The first three are fixed by asking for more of the same response. The
 * fourth is fixed by saying when the reading was taken, which is the honest
 * repair: a cache that protects a free provider is worth keeping, and a number
 * with its time on it is not stale, it is dated.
 */

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export interface Conditions {
  /** Air temperature at two metres, in °C. */
  temperature: number;
  /**
   * What it feels like, which folds in humidity, wind and radiation.
   *
   * Null where the provider did not send it. Shown only when it differs from
   * the air temperature by enough to be worth the extra word — see the panel.
   */
  apparent: number | null;
  code: number;
  description: string;
  /** False at night, which is the difference between a sun and a moon. */
  isDay: boolean;
  /** The provider's own timestamp for the reading, as it sent it. */
  observedAt: string | null;
}

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/**
 * `count` is 10 rather than 1 because one result is not a choice.
 *
 * The geocoder ranks by population, so asking for a single row means taking
 * whichever same-named town happens to be larger and calling it the answer.
 * A shortlist lets pickPlace() match the province the organisation actually
 * gave us, and a business in the smaller of two towns stops being told the
 * weather of the bigger one.
 */
export function geocodeUrl(city: string, countryCode?: string | null): string {
  const url = new URL(GEOCODING);
  url.searchParams.set('name', city);
  url.searchParams.set('count', '10');
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
  /*
   * Four fields rather than two, in the same request at the same cost.
   * apparent_temperature is what a person would call the temperature, is_day
   * decides between a sun and a moon, and the response carries current.time
   * whether it is asked for or not — that is what lets the panel say how old
   * a reading is instead of implying it is now.
   */
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day');
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

function readRow(value: unknown): Place | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
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

export function readPlace(payload: unknown): Place | null {
  return pickPlace(payload, null);
}

/**
 * The right one of several towns with the same name.
 *
 * Open-Meteo's geocoder ranks by population, so the first row is the biggest
 * place called that — which is the correct answer for most businesses and the
 * wrong one for every business in the smaller town. South Africa alone has a
 * Springs in Gauteng and a Springs in the Eastern Cape.
 *
 * `province` is whatever the administrator typed into the trading address, so
 * it is matched loosely: case is ignored, surrounding space is ignored, and
 * either side containing the other counts — "KZN" will not match "KwaZulu-
 * Natal", but "Northern Cape" matches "Northern Cape" and "gauteng" matches
 * "Gauteng", which is the difference between a typed field and a dropdown.
 *
 * No match falls back to the first readable row rather than to nothing. A
 * province that was mistyped, or a country whose admin1 names do not look
 * like what people write, should cost the reader precision — not the tile.
 */
export function pickPlace(payload: unknown, province?: string | null): Place | null {
  const results = (payload as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return null;

  const places = results.map(readRow).filter((p): p is Place => p !== null);
  if (places.length === 0) return null;

  const wanted = province?.trim().toLowerCase();
  if (wanted) {
    const matched = places.find((p) => {
      const admin = p.admin1?.trim().toLowerCase();
      if (!admin) return false;
      return admin === wanted || admin.includes(wanted) || wanted.includes(admin);
    });
    if (matched) return matched;
  }

  return places[0]!;
}

export function readConditions(payload: unknown): Conditions | null {
  const current = (payload as { current?: unknown } | null)?.current;
  if (!current || typeof current !== 'object') return null;

  const row = current as Record<string, unknown>;
  const temperature = asNumber(row.temperature_2m);
  const code = asNumber(row.weather_code);
  if (temperature === null || code === null) return null;

  /*
   * Only these two are required. A missing apparent temperature costs a
   * parenthesis, a missing is_day costs the right glyph, and a missing time
   * costs the freshness line — none of them is worth withholding a reading
   * that has a temperature and a sky in it.
   *
   * is_day defaults to true rather than false: drawing a sun by day when the
   * field is absent is the ordinary case, and drawing a moon at noon is the
   * more obviously broken of the two mistakes.
   */
  const isDay = asNumber(row.is_day);

  return {
    temperature,
    apparent: asNumber(row.apparent_temperature),
    code,
    description: describeWeather(code),
    isDay: isDay === null ? true : isDay === 1,
    observedAt: typeof row.time === 'string' ? row.time : null,
  };
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
 *
 * ── the sun at nine in the evening ───────────────────────────────────────
 * This drew ☀️ for a clear sky whatever the hour, which is the single most
 * visible thing that was wrong with the tile: at dusk it showed a business
 * a blazing sun over its own town.
 *
 * Only the clear and near-clear skies change. A cloud, fog or rain looks the
 * same after dark, and swapping in a night variant of each would be a
 * different picture for the same weather — decoration pretending to be
 * information.
 *
 * `isDay` defaults to true so an older caller, or a response without the
 * field, keeps exactly the behaviour it had.
 */
export function weatherGlyph(code: number, isDay = true): string {
  if (code === 0 || code === 1) return isDay ? '☀️' : '🌙';
  if (code === 2) return isDay ? '⛅' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  // Freezing rain is not drizzle, and the two were one band. 66 and 67 are
  // the codes that ice a road.
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 65) return '🌧️';
  if (code === 66 || code === 67) return '🧊';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code === 85 || code === 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}
