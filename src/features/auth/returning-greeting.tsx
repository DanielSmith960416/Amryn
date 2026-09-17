'use client';

import { useEffect, useState } from 'react';
import { readDeviceName } from '@/lib/greeting/device-name';
import { welcomeBack } from '@/lib/greeting/greeting';

/**
 * "Welcome back, Daniel" above the sign-in form.
 *
 * Read from this browser's own storage, written the last time somebody signed
 * in on it. Nobody is authenticated at this point and nothing here pretends
 * otherwise: it is a word on a screen, it grants nothing, and a stranger on a
 * device that has never been used sees the form exactly as it was.
 *
 * Client-side and after mount, deliberately. The sign-in page is rendered per
 * request by a server that cannot read localStorage, so a name in the initial
 * HTML is impossible — and trying to put one there through a cookie would make
 * a real claim about who is at the keyboard, which this is not.
 */
export function ReturningGreeting() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage(welcomeBack(readDeviceName()));
  }, []);

  if (!message) return null;

  return (
    <p className="mt-4 text-[0.875rem] font-medium text-[var(--text-primary)]">
      {message}
    </p>
  );
}
