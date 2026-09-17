'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { isBirthday, localToday } from '@/lib/greeting/greeting';

const DISMISSED_KEY = 'amryn.birthday.dismissed';

/**
 * "🎉 Happy Birthday, Daniel!" — once, on the day, wherever you happen to land.
 *
 * ── the day is the reader's, not the server's ────────────────────────────
 * The check runs in the browser against the date on the clock in front of the
 * reader. Doing it on the server would compare a stored calendar date against
 * a UTC instant, and somebody in Los Angeles would be congratulated on the
 * evening of the 15th every year — the kind of bug that is invisible in
 * Johannesburg, where the server and the office agree, and obvious to the one
 * customer who travels. isBirthday() takes two calendar dates and converts
 * neither, and localToday() reads the local parts rather than toISOString().
 *
 * This is also why nothing renders on the server: the first paint has no idea
 * what day it is where the reader is. A banner that appears a frame late is a
 * banner; one that appears on the wrong day is a mistake about somebody's
 * birthday.
 *
 * ── once a day ───────────────────────────────────────────────────────────
 * Dismissing it stores today's date, so it stays gone for the rest of the day
 * and comes back next year. The key holds a date rather than a flag so it
 * cannot silently suppress next year's greeting, and it needs no cleaning up.
 */
export function BirthdayBanner({
  dateOfBirth,
  firstName,
}: {
  dateOfBirth: string | null;
  firstName: string | null;
}) {
  const [show, setShow] = useState(false);
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    const date = localToday();
    setToday(date);
    if (!isBirthday(dateOfBirth, date)) return;

    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY);
    } catch {
      // A browser that refuses storage gets the banner every load today, which
      // is a better failure than never getting it.
    }
    setShow(dismissed !== date);
  }, [dateOfBirth]);

  if (!show) return null;

  const name = firstName?.trim();

  return (
    <div
      role="status"
      className="mb-5 flex items-center gap-3 rounded-[var(--radius-tile)] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3"
    >
      <span aria-hidden className="text-[1.125rem]">
        🎉
      </span>
      <p className="flex-1 text-[0.875rem] font-medium text-[var(--text-primary)]">
        {name ? `Happy Birthday, ${name}!` : 'Happy Birthday!'}
      </p>
      <button
        type="button"
        onClick={() => {
          setShow(false);
          try {
            if (today) localStorage.setItem(DISMISSED_KEY, today);
          } catch {
            // Dismissed for this page either way.
          }
        }}
        aria-label="Dismiss"
        className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
