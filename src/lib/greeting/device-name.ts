'use client';

/**
 * The first name this browser saw last, so the sign-in page can say hello
 * before anybody has proved who they are.
 *
 * ── what this is, and what it is emphatically not ────────────────────────
 * It is a convenience on one device. It is not identity, it is not a session,
 * and nothing anywhere reads it to decide what may be shown: the sign-in page
 * prints it and that is the whole of its power. Editing it in the browser's
 * developer tools changes a word on a screen.
 *
 * That matters because there is an older module in this codebase —
 * lib/profile.ts — that remembers a name for the marketing site's client area
 * and explains at length that it is "a door, not a lock". This is smaller and
 * does less, and is deliberately separate rather than bolted onto that one:
 * theirs holds a full name, a company and an email for a static site with no
 * server; this holds a first name for a product that has one.
 *
 * ── when it is written ───────────────────────────────────────────────────
 * Only from inside the application shell, which renders only for a session the
 * server has already validated. So it is never written for a device that has
 * not signed in — a stranger who opens the sign-in page and leaves gets
 * nothing stored.
 *
 * ── when it is forgotten ─────────────────────────────────────────────────
 * On sign-out, beside the older profile store. Somebody signing out of a
 * shared machine has said they are done with it, and leaving their name on the
 * next person's screen would be a small betrayal of that.
 */

const STORAGE_KEY = 'amryn.device.first-name';

/**
 * Every access is wrapped. localStorage throws outright rather than returning
 * null in some privacy configurations — Safari with cookies blocked, a browser
 * in lockdown mode — and an exception thrown while rendering the sign-in page
 * would take the sign-in page down. Somebody whose browser refuses to store
 * anything gets no greeting, which is the correct outcome.
 */
export function readDeviceName(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    // A name long enough to be a paste of something else is not a name.
    return trimmed && trimmed.length <= 80 ? trimmed : null;
  } catch {
    return null;
  }
}

export function rememberDeviceName(firstName: string | null | undefined): void {
  const name = firstName?.trim();
  try {
    if (!name) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, name.slice(0, 80));
  } catch {
    // A device that cannot remember is not a failure worth reporting.
  }
}

export function forgetDeviceName(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do, and nothing that depends on it.
  }
}
