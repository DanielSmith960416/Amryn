'use client';

import { useEffect, useState } from 'react';
import { greeting, timeOfDay, type TimeOfDay } from '@/lib/greeting/greeting';

/**
 * "Good morning, Daniel", at the top of the Command Centre.
 *
 * ── why the server sends a greeting at all ───────────────────────────────
 * The time of day is the reader's, and the server does not know where they
 * are. The easy answer is to render nothing until the browser says — and it
 * looks cheap: the page arrives, and a moment later a line of text appears and
 * pushes the heading down.
 *
 * So the server sends its best guess, computed from the organisation's own
 * timezone, which for almost every reader is the one they are sitting in. The
 * browser then checks, and corrects it only when it actually disagrees —
 * somebody working from another country, or reading at ten past midnight while
 * the office is still on yesterday. Nothing moves for the common case, and the
 * rare case is right within a frame.
 */
export function Greeting({
  firstName,
  initialPart,
}: {
  firstName: string | null;
  /** Computed on the server from the organisation's timezone. */
  initialPart: TimeOfDay;
}) {
  const [part, setPart] = useState<TimeOfDay>(initialPart);

  useEffect(() => {
    const here = timeOfDay(new Date().getHours());
    if (here !== initialPart) setPart(here);
  }, [initialPart]);

  /*
    Deliberately not the .eyebrow class, though it sits in the eyebrow's slot.
    That class uppercases, which is right for a label — DETECT → SIMULATE → ACT
    is a label — and wrong for a greeting: "GOOD MORNING, DANIEL" is shouting
    somebody's name at them first thing in the morning. Same face, same size,
    same colour, same position; sentence case, and the tracking eased off
    because letter-spacing that wide is for capitals.
  */
  return (
    <p className="font-mono text-[0.6875rem] font-medium tracking-[0.04em] text-[var(--text-secondary)]">
      {greeting(part, firstName)}
    </p>
  );
}
