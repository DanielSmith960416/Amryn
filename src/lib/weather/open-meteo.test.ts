import { describe, expect, it } from 'vitest';
import {
  describeWeather,
  forecastUrl,
  geocodeUrl,
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
  current: { time: '2026-09-17T08:00', interval: 900, temperature_2m: 18.4, weather_code: 1 },
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
  it('asks for one result, narrowed by country', () => {
    const url = new URL(geocodeUrl('Kimberley', 'ZA'));
    expect(url.searchParams.get('name')).toBe('Kimberley');
    expect(url.searchParams.get('count')).toBe('1');
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
  it('asks only for what the panel shows', () => {
    const url = new URL(forecastUrl(-28.7323, 24.7623));
    expect(url.searchParams.get('current')).toBe('temperature_2m,weather_code');
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
  it('reads the temperature and the code', () => {
    expect(readConditions(forecast)).toEqual({
      temperature: 18.4,
      code: 1,
      description: 'Mainly clear',
    });
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
      code: 0,
      description: 'Clear',
    });
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
    for (const code of [0, 1, 2, 3, 45, 51, 61, 71, 80, 85, 95, 999]) {
      expect(weatherGlyph(code).length, `code ${code}`).toBeGreaterThan(0);
    }
  });
});
