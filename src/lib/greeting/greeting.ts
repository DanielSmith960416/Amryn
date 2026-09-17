/**
 * Greeting somebody by name, at the right time of day, on the right day.
 *
 * Pure functions, separate from the components that show them, because every
 * interesting thing here is a boundary condition — midnight, noon, a leap-year
 * birthday, a device an hour ahead of the server — and boundaries are worth
 * testing without rendering anything.
 */

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/**
 * Which part of the day an hour belongs to.
 *
 * Midnight to noon is morning, noon to six is afternoon, and the rest is
 * evening. "Good evening" at half past eleven is right; "good night" would be
 * a farewell, and this is a greeting for somebody who has just arrived.
 */
export function timeOfDay(hour: number): TimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * The greeting itself.
 *
 * Without a name it is still a sentence — "Good morning" — rather than a
 * sentence with a hole in it. A profile with no first name is normal on a
 * fresh account, and "Good morning, " reads as a bug.
 */
export function greeting(part: TimeOfDay, firstName?: string | null): string {
  const time = `Good ${part}`;
  const name = firstName?.trim();
  return name ? `${time}, ${name}` : time;
}

/**
 * Welcoming back a device that has been here before.
 *
 * Used on the sign-in page, where nobody is authenticated yet and the only
 * thing known is what this browser remembered last time.
 */
export function welcomeBack(firstName?: string | null): string | null {
  const name = firstName?.trim();
  return name ? `Welcome back, ${name}` : null;
}

/**
 * Whether today is the birthday.
 *
 * ── why both dates are strings ───────────────────────────────────────────
 * The stored date is a calendar date — 1984-04-16 — and not an instant. The
 * day somebody is being greeted on is also a calendar date, the one on the
 * clock in front of them. Comparing those as Date objects invites exactly the
 * bug this is written to avoid: `new Date('1984-04-16')` is parsed as
 * midnight UTC, which in Johannesburg is two in the morning on the 16th and in
 * Los Angeles is five in the afternoon on the *15th*. A reader in California
 * would be wished a happy birthday a day early, every year, and a reader in
 * Auckland a day late.
 *
 * So no timezone conversion happens at all. The month and day are read off the
 * two strings and compared as text, and the caller is responsible for handing
 * in today's date as the device sees it — which is what localToday() is for.
 *
 * The year is ignored on purpose: it is a birthday, not an anniversary of a
 * single date.
 */
export function isBirthday(dateOfBirth: string | null | undefined, today: string): boolean {
  if (!dateOfBirth) return false;
  const born = dateOfBirth.slice(5, 10);
  const now = today.slice(5, 10);
  if (born.length !== 5 || now.length !== 5) return false;

  // 29 February, greeted on the 28th in a year that has no 29th. The
  // alternative is that these readers are wished a happy birthday once every
  // four years, which is a worse answer than a day's approximation.
  if (born === '02-29' && now === '02-28' && !isLeapYear(Number(today.slice(0, 4)))) {
    return true;
  }

  return born === now;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Today, as the device in front of the reader sees it, as YYYY-MM-DD.
 *
 * Deliberately built from the local parts rather than toISOString(), which
 * converts to UTC first and would put the reader on yesterday or tomorrow for
 * part of every day.
 */
export function localToday(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The hour in a named timezone, 0–23.
 *
 * Used on the server so the greeting is already right in the page it sends,
 * rather than arriving as "Good morning" and correcting itself to "Good
 * evening" a moment after the page paints. The organisation carries a timezone
 * — Africa/Johannesburg by default — and for almost every reader that is the
 * one they are sitting in; the client corrects it on mount for the ones who
 * are not.
 *
 * hourCycle 'h23' rather than hour12: false, which formats midnight as "24" in
 * several locales and would be read as an invalid hour.
 */
export function hourInTimezone(timeZone: string, now: Date = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone,
    }).format(now);
    const hour = Number(formatted);
    return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : now.getHours();
  } catch {
    // An organisation with a timezone the runtime does not know is not worth
    // failing a page render over.
    return now.getHours();
  }
}
