import { describe, expect, it } from 'vitest';
import { feelsLike, observedLabel } from './weather-panel';

/*
 * The two decisions the tile makes about what to say, rather than about what
 * the weather is. Both exist because the reported complaint was accuracy, and
 * a number shown without its qualifier is the commonest way a tile is wrong
 * while looking right.
 */

describe('whether to say what it feels like', () => {
  it('says nothing when the provider did not send one', () => {
    expect(feelsLike({ temperature: 18.4, apparent: null })).toBeNull();
  });

  it('says nothing when it agrees with the air temperature', () => {
    // "18°C, feels like 18°C" is two numbers saying one thing.
    expect(feelsLike({ temperature: 18.4, apparent: 18.1 })).toBeNull();
    expect(feelsLike({ temperature: 18.4, apparent: 19.5 })).toBeNull();
  });

  it('says it once the gap is worth a second number', () => {
    // A dry Northern Cape afternoon: the air says 31, standing in it says 36.
    expect(feelsLike({ temperature: 31.2, apparent: 35.8 })).toBe(36);
    // And the other direction, which is the one people check before leaving.
    expect(feelsLike({ temperature: 8.1, apparent: 3.4 })).toBe(3);
  });

  /*
   * The property the tile depends on: whenever a second number is printed, it
   * is a different number. At the current threshold that follows from the
   * arithmetic — a gap of two or more cannot round to one degree — so this
   * asserts the outcome across the range rather than pretending to exercise
   * the guard in feelsLike(), which is unreachable until somebody lowers the
   * threshold below one. That is what the guard is there for.
   */
  it('never prints the same degree twice', () => {
    for (let air = -15; air <= 45; air += 0.25) {
      for (let gap = -14; gap <= 14; gap += 0.25) {
        const felt = feelsLike({ temperature: air, apparent: air + gap });
        if (felt !== null) {
          expect(felt, `air ${air}, gap ${gap}`).not.toBe(Math.round(air));
        }
      }
    }
  });

  it('handles zero, which is falsy and a real temperature', () => {
    expect(feelsLike({ temperature: 4.0, apparent: 0.2 })).toBe(0);
  });
});

describe('whether to say when the reading was taken', () => {
  // Open-Meteo sends the location's own wall clock, with no offset on it.
  const taken = '2026-09-17T19:00';

  it('says nothing about a reading that is current', () => {
    expect(observedLabel(taken, new Date(2026, 8, 17, 19, 5))).toBeNull();
    expect(observedLabel(taken, new Date(2026, 8, 17, 19, 19))).toBeNull();
  });

  it('states the hour once the reading has fallen behind', () => {
    expect(observedLabel(taken, new Date(2026, 8, 17, 19, 35))).toBe('as at 19:00');
    expect(observedLabel(taken, new Date(2026, 8, 17, 20, 10))).toBe('as at 19:00');
  });

  /*
   * A reading timestamped ahead of the reader's clock is two clocks
   * disagreeing, or a traveller in another timezone — not news about the
   * weather. Saying "as at 21:00" at seven in the evening would read as a
   * fault in the product.
   */
  it('says nothing about a reading from the future', () => {
    expect(observedLabel('2026-09-17T21:00', new Date(2026, 8, 17, 19, 0))).toBeNull();
  });

  it('says nothing rather than guessing at a time it cannot read', () => {
    for (const value of [null, '', 'yesterday', '2026-09-17', 'T19:00']) {
      expect(observedLabel(value, new Date(2026, 8, 17, 19, 35)), String(value)).toBeNull();
    }
  });

  it('reads a timestamp carrying an offset without shifting the hour', () => {
    // The hour is taken from the string rather than through a Date, so the
    // label always names the hour the provider printed for that place.
    expect(observedLabel('2026-09-17T19:00+02:00', new Date(2026, 8, 17, 19, 40))).toBe(
      'as at 19:00',
    );
  });
});
