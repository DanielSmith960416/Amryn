'use client';

import { useEffect } from 'react';
import { rememberDeviceName } from '@/lib/greeting/device-name';

/**
 * Notes the first name on this device, so the sign-in page can say hello next
 * time before anybody has proved who they are.
 *
 * Renders nothing. It lives in the application shell rather than on a page
 * because the shell is the thing that only ever renders for a session the
 * server has already validated — which is exactly the condition for storing
 * this at all. A stranger who opens the sign-in page and leaves stores
 * nothing.
 *
 * It re-runs when the name changes, so editing your name in settings corrects
 * the greeting rather than leaving the old one on the door.
 */
export function RememberDevice({ firstName }: { firstName: string | null }) {
  useEffect(() => {
    rememberDeviceName(firstName);
  }, [firstName]);

  return null;
}
