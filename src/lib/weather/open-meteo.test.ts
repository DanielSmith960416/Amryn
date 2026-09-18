import { describe, expect, it } from 'vitest';
import {
  describeWeather,
  forecastUrl,
  geocodeUrl,
  pickPlace,
  readConditions,
  readPlace,
  weatherGlyph,
} from './open-meteo';

/**
 * Fixtures, not a live call.
 *
 * api.open-meteo.com is unreachable from the machine this was written on, so
 * these payloads are built from the documented response shape rather than
 * recorded from the wire. That is stated plainly in the module itself, and it
 * is the reason the readers below are tested hardest on what they do when the
 * shape is *not* what is expected — which is the case that actually protects
 * the dashboard if the documentation and the API ever disagree.
 */
const forecast = {
  latitude: -28.75,
  longitude: 24.75,
  timezone: 'Africa/Johannesburg',
  current: {
    time: '2026-09-17T08:00',
    interval: 900,
    temperature_2m: 18.4,
    apparent_temperature: 16.1,
    weather_code: 1,
    is_day: 1,
  },
};

const geocoded = {
  results: [
    {
      id: 986717,
      name: 'Kimberley',
      latitude: -28.7323,
      longitude: 24.7623,
      country_code: 'ZA',
      country: 'South Africa',
      admin1: 'Northern Cape',
    },
  ],
};

describe('geocodeUrl', () => {
  /*
   * It asked for one result, which is not a choice — the geocoder ranks by
   * population, so a single row is whichever same-named town is bigger.
   */
  it('asks for a shortlist, narrowed by country', () => {
    const url = new URL(geocodeUrl('Kimberley', 'ZA'));
    expect(url.searchParams.get('name')).toBe('Kimberley');
    expect(url.searchParams.get('count')).toBe('10');
    // Kimberley is also in Australia and in Canada.
    expect(url.searchParams.get('countryCode')).toBe('ZA');
  });

  it('works without a country', () => {
    const url = new URL(geocodeUrl('Kimberley', null));
    expect(url.searchParams.has('countryCode')).toBe(false);
  });

  it('escapes a city with a space or an accent', () => {
    expect(geocodeUrl('Port Elizabeth', 'ZA')).toContain('name=Port+Elizabeth');
    expect(geocodeUrl('Malmö', null)).toContain('Malm%C3%B6');
  });
});

describe('forecastUrl', () => {
  it('asks for what the panel shows', () => {
    const url = new URL(forecastUrl(-28.7323, 24.7623));
    const current = url.searchParams.get('current')!.split(',');
    // is_day is the one that stops a clear evening drawing a blazing sun, and
    // apparent_temperature is what a person standing outside would say.
    expect(current).toContain('temperature_2m');
    expect(current).toContain('apparent_temperature');
    expect(current).toContain('weather_code');
    expect(current).toContain('is_day');
  });

  /*
   * Three decimals is about a hundred metres. Beyond that it is useless for
   * weather, it is a needlessly exact record of where somebody is standing,
   * and it makes the cache key differ for every reader in the same town.
   */
  it('rounds the coordinates, which is both a privacy and a caching decision', () => {
    const url = new URL(forecastUrl(-28.73234567, 24.76231111));
    expect(url.searchParams.get('latitude')).toBe('-28.732');
    expect(url.searchParams.get('longitude')).toBe('24.762');
  });
});

describe('readPlace', () => {
  it('reads the first result', () => {
    expect(readPlace(geocoded)).toEqual({
      name: 'Kimberley',
      latitude: -28.7323,
      longitude: 24.7623,
      country: 'South Africa',
      admin1: 'Northern Cape',
    });
  });

  it('returns null rather than throwing on anything unexpected', () => {
    for (const payload of [null, undefined, {}, { results: [] }, { results: 'nope' }, 'text', 42]) {
      expect(readPlace(payload), JSON.stringify(payload)).toBeNull();
    }
  });

  it('refuses a result missing the parts that matter', () => {
    expect(readPlace({ results: [{ name: 'Kimberley' }] })).toBeNull();
    expect(readPlace({ results: [{ latitude: 1, longitude: 2 }] })).toBeNull();
  });
});

describe('readConditions', () => {
  it('reads the temperature, the code, the feel, the hour and the time', () => {
    expect(readConditions(forecast)).toEqual({
      temperature: 18.4,
      apparent: 16.1,
      code: 1,
      description: 'Mainly clear',
      isDay: true,
      observedAt: '2026-09-17T08:00',
    });
  });

  /*
   * The three new fields are all optional. A provider that stops sending one
   * should cost a parenthesis, a glyph or a timestamp — never the reading.
   */
  it('still reads a response carrying only the two required fields', () => {
    expect(readConditions({ current: { temperature_2m: 18.4, weather_code: 1 } })).toEqual({
      temperature: 18.4,
      apparent: null,
      code: 1,
      description: 'Mainly clear',
      isDay: true,
      observedAt: null,
    });
  });

  it('reads night from is_day, and assumes day when it is absent', () => {
    const night = { current: { temperature_2m: 12, weather_code: 0, is_day: 0 } };
    expect(readConditions(night)?.isDay).toBe(false);
    // Absent defaults to day: a sun at midnight is obvious, a moon at noon is
    // the more confusing of the two ways to be wrong.
    expect(readConditions({ current: { temperature_2m: 12, weather_code: 0 } })?.isDay).toBe(true);
  });

  it('takes a number that arrives as a string', () => {
    const asText = { current: { temperature_2m: '18.4', weather_code: '1' } };
    expect(readConditions(asText)?.temperature).toBe(18.4);
  });

  /*
   * The case this whole defensive layer exists for: a third party changes a
   * field name and the dashboard loses its weather tile rather than throwing
   * while rendering.
   */
  it('returns null rather than throwing on anything unexpected', () => {
    for (const payload of [
      null,
      undefined,
      {},
      { current: null },
      { current: {} },
      { current: { temperature: 18.4 } },
      { current: { temperature_2m: 'warm', weather_code: 1 } },
      'text',
    ]) {
      expect(readConditions(payload), JSON.stringify(payload)).toBeNull();
    }
  });

  it('handles a freezing temperature and zero, which are falsy in the wrong hands', () => {
    expect(readConditions({ current: { temperature_2m: 0, weather_code: 0 } })).toEqual({
      temperature: 0,
      apparent: null,
      code: 0,
      description: 'Clear',
      isDay: true,
      observedAt: null,
    });
    // is_day: 0 is falsy and means night, not missing.
    const frozen = { current: { temperature_2m: 0, weather_code: 0, is_day: 0, apparent_temperature: 0 } };
    expect(readConditions(frozen)?.isDay).toBe(false);
    expect(readConditions(frozen)?.apparent).toBe(0);
    expect(readConditions({ current: { temperature_2m: -4.5, weather_code: 71 } })?.temperature).toBe(
      -4.5,
    );
  });
});

describe('describeWeather', () => {
  it('puts the common codes into plain words', () => {
    expect(describeWeather(0)).toBe('Clear');
    expect(describeWeather(3)).toBe('Overcast');
    expect(describeWeather(63)).toBe('Rain');
    expect(describeWeather(95)).toBe('Thunderstorm');
  });

  it('does not pretend to know a code it has never seen', () => {
    expect(describeWeather(999)).toBe('Unknown');
    expect(describeWeather(-1)).toBe('Unknown');
  });
});

describe('weatherGlyph', () => {
  it('has something for every code it describes', () => {
    for (const code of [0, 1, 2, 3, 45, 51, 61, 66, 71, 80, 85, 95, 999]) {
      expect(weatherGlyph(code).length, `code ${code}`).toBeGreaterThan(0);
    }
  });

  /*
   * The report that started this: a clear sky at nine in the evening drew a
   * blazing sun over the reader's own town.
   */
  it('does not draw the sun after dark', () => {
    expect(weatherGlyph(0, true)).toBe('☀️');
    expect(weatherGlyph(0, false)).not.toBe('☀️');
    expect(weatherGlyph(1, false)).not.toBe('☀️');
  });

  it('leaves the weather that looks the same after dark alone', () => {
    // Overcast, fog and rain do not have a night version worth drawing — a
    // different picture for the same weather is decoration posing as fact.
    for (const code of [3, 45, 61, 80, 95]) {
      expect(weatherGlyph(code, false), `code ${code}`).toBe(weatherGlyph(code, true));
    }
  });

  it('defaults to day, so an older caller is unchanged', () => {
    expect(weatherGlyph(0)).toBe(weatherGlyph(0, true));
  });

  // 66 and 67 ice a road. They were banded with drizzle.
  it('separates freezing rain from drizzle', () => {
    expect(weatherGlyph(66)).not.toBe(weatherGlyph(51));
    expect(weatherGlyph(67)).toBe(weatherGlyph(66));
  });
});

/*
 * Two towns of one name in one country. South Africa has a Springs in Gauteng
 * and a Springs in the Eastern Cape, and the geocoder ranks by population, so
 * asking for one row hands the smaller town the larger one's weather.
 */
describe('pickPlace', () => {
  const springs = {
    results: [
      { name: 'Springs', latitude: -26.25, longitude: 28.44, admin1: 'Gauteng', country: 'South Africa' },
      { name: 'Springs', latitude: -32.9, longitude: 27.5, admin1: 'Eastern Cape', country: 'South Africa' },
    ],
  };

  it('takes the one in the province the business gave', () => {
    expect(pickPlace(springs, 'Eastern Cape')?.latitude).toBe(-32.9);
    expect(pickPlace(springs, 'Gauteng')?.latitude).toBe(-26.25);
  });

  it('ignores case and stray spacing, because this is a typed field', () => {
    expect(pickPlace(springs, '  eastern cape ')?.latitude).toBe(-32.9);
  });

  it('falls back to the first rather than to nothing', () => {
    // A mistyped province should cost precision, never the tile.
    expect(pickPlace(springs, 'Notaprovince')?.latitude).toBe(-26.25);
    expect(pickPlace(springs, null)?.latitude).toBe(-26.25);
  });

  it('skips an unreadable row instead of returning it', () => {
    const mixed = { results: [{ name: 'Springs' }, springs.results[1]] };
    expect(pickPlace(mixed, 'Eastern Cape')?.latitude).toBe(-32.9);
  });

  it('is what readPlace now is, so the old callers keep working', () => {
    expect(readPlace(geocoded)).toEqual(pickPlace(geocoded, null));
  });
});
