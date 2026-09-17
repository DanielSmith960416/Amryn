import { describe, expect, it } from 'vitest';
import {
  greeting,
  hourInTimezone,
  isBirthday,
  localToday,
  timeOfDay,
  welcomeBack,
} from './greeting';

describe('timeOfDay', () => {
  it('divides the day at noon and six', () => {
    expect(timeOfDay(0)).toBe('morning');
    expect(timeOfDay(11)).toBe('morning');
    expect(timeOfDay(12)).toBe('afternoon');
    expect(timeOfDay(17)).toBe('afternoon');
    expect(timeOfDay(18)).toBe('evening');
    expect(timeOfDay(23)).toBe('evening');
  });
});

describe('greeting', () => {
  it('uses the name when there is one', () => {
    expect(greeting('morning', 'Daniel')).toBe('Good morning, Daniel');
  });

  /*
   * A fresh account has no first name until somebody fills the field in, and
   * "Good morning, " reads as a bug rather than as a greeting.
   */
  it('is still a sentence without one', () => {
    expect(greeting('afternoon', null)).toBe('Good afternoon');
    expect(greeting('evening', '   ')).toBe('Good evening');
    expect(greeting('morning', undefined)).toBe('Good morning');
  });
});

describe('welcomeBack', () => {
  it('greets a device that has been here before', () => {
    expect(welcomeBack('Daniel')).toBe('Welcome back, Daniel');
  });

  it('says nothing at all when the device does not know who this is', () => {
    // Null rather than a generic "Welcome back": the sign-in page has its own
    // heading, and a stranger should not be told they have been here before.
    expect(welcomeBack(null)).toBeNull();
    expect(welcomeBack('')).toBeNull();
  });
});

describe('isBirthday', () => {
  it('matches on month and day, whatever the year', () => {
    expect(isBirthday('1984-04-16', '2026-04-16')).toBe(true);
    expect(isBirthday('1984-04-16', '2027-04-16')).toBe(true);
  });

  it('is false on every other day', () => {
    expect(isBirthday('1984-04-16', '2026-04-15')).toBe(false);
    expect(isBirthday('1984-04-16', '2026-04-17')).toBe(false);
    expect(isBirthday('1984-04-16', '2026-05-16')).toBe(false);
  });

  it('says nothing when no date was given', () => {
    expect(isBirthday(null, '2026-04-16')).toBe(false);
    expect(isBirthday(undefined, '2026-04-16')).toBe(false);
    expect(isBirthday('', '2026-04-16')).toBe(false);
  });

  /*
   * The bug this function exists to avoid. Comparing Date objects would parse
   * the stored date as midnight UTC, which is the previous evening in the
   * Americas — so a reader in Los Angeles would be greeted on the 15th, every
   * year. Both sides are calendar dates and neither is converted.
   */
  it('compares calendar dates, so no timezone can shift the day', () => {
    expect(isBirthday('1984-04-16', '2026-04-16')).toBe(true);
    // Same instant, different local dates, and the answer follows the local one.
    expect(isBirthday('1984-04-16', '2026-04-15')).toBe(false);
  });

  it('greets a 29 February birthday on the 28th in a common year', () => {
    expect(isBirthday('2000-02-29', '2026-02-28')).toBe(true);
    expect(isBirthday('2000-02-29', '2028-02-29')).toBe(true);
    // and not twice in a leap year
    expect(isBirthday('2000-02-29', '2028-02-28')).toBe(false);
  });
});

describe('localToday', () => {
  it('reads the local calendar date, not the UTC one', () => {
    // 23:30 on 31 December, local. toISOString() would call this 1 January.
    const newYearsEve = new Date(2026, 11, 31, 23, 30, 0);
    expect(localToday(newYearsEve)).toBe('2026-12-31');
  });

  it('pads the month and day', () => {
    expect(localToday(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});

describe('hourInTimezone', () => {
  it('reads the hour where the business is, not where the server is', () => {
    // 22:00 UTC is midnight in Johannesburg and 15:00 in Los Angeles.
    const instant = new Date('2026-04-16T22:00:00Z');
    expect(hourInTimezone('Africa/Johannesburg', instant)).toBe(0);
    expect(hourInTimezone('America/Los_Angeles', instant)).toBe(15);
    expect(hourInTimezone('UTC', instant)).toBe(22);
  });

  it('formats midnight as 0 rather than 24', () => {
    expect(hourInTimezone('UTC', new Date('2026-04-16T00:30:00Z'))).toBe(0);
  });

  it('falls back to the machine rather than failing the page', () => {
    const instant = new Date('2026-04-16T22:00:00Z');
    expect(hourInTimezone('Not/AZone', instant)).toBe(instant.getHours());
  });
});
