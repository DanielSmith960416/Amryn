'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The date and time, in one component used in both places that show it.
 *
 * ── why nothing renders until the browser says ───────────────────────────
 * A clock is the one thing on the page that genuinely cannot be server
 * rendered. The server knows its own time in its own timezone; the reader
 * wants theirs. Rendering the server's time and correcting it after hydration
 * shows a wrong time — briefly, but a clock showing the wrong time is worse
 * than a clock that arrives a moment late, and React would object to the
 * mismatch anyway.
 *
 * So the space is reserved and filled on mount. The placeholder is the same
 * width as the finished thing, so nothing around it moves.
 *
 * ── it ticks on the minute, not every second ─────────────────────────────
 * The readout has no seconds, so a one-second interval would re-render sixty
 * times to change the display once. The first timeout lands on the next minute
 * boundary and an interval takes over from there — so the minute changes when
 * the minute actually changes, rather than up to a minute late.
 */
export function Clock({
  className,
  withDate = true,
}: {
  className?: string;
  /** The top bar shows the time alone; the dashboard has room for the date. */
  withDate?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    let interval: ReturnType<typeof setInterval> | undefined;
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const time = now
    ? now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--:--';

  const date = now
    ? now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : '';

  return (
    <span
      className={cn('font-mono tabular-nums text-[var(--text-secondary)]', className)}
      // The value changes under the reader's cursor once a minute and is not
      // news. Announcing it would interrupt a screen reader mid-sentence.
      aria-hidden={now === null ? true : undefined}
    >
      {withDate && date ? <span className="mr-2 text-[var(--text-tertiary)]">{date}</span> : null}
      <time dateTime={now?.toISOString()}>{time}</time>
    </span>
  );
}
