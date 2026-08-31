'use client';

/**
 * Who is using this workspace, remembered on this device.
 *
 * ## Read this before treating it as authentication, because it is not
 *
 * This site is a static export on GitHub Pages. There is no server. That means
 * there is nowhere to check a password, nowhere to keep a secret, and nothing
 * to sign a session with. Every page of the client area is a file that anyone
 * who knows its URL can fetch directly, whether or not they have ever seen the
 * sign-in form.
 *
 * So this module does not authenticate anybody. It remembers a name and a
 * business on the device, so the platform can greet you and so "Open the
 * platform" leads somewhere that feels like yours. The guard it powers is a
 * **door, not a lock** — it shapes the journey, it does not protect anything.
 *
 * That is an honest trade while the workspace contains demonstration figures
 * and nothing else, which is the case today: every page says so in a banner,
 * and the data is the same illustrative business for every visitor.
 *
 * **It stops being an honest trade the moment a real client's numbers are in
 * here.** At that point the product needs a server again — the README has the
 * section on what that costs and what it would restore. Do not put a real
 * client's data behind this gate.
 *
 * No password is asked for, and none is stored. Asking for one would be the
 * dishonest part: it would look like security while checking nothing.
 */

export interface Profile {
  fullName: string;
  companyName: string;
  email: string;
  /** ISO timestamp of when this device first opened the platform. */
  since: string;
}

const STORAGE_KEY = 'amryn-profile';

/**
 * Reads the stored profile.
 *
 * Every access is wrapped: `localStorage` throws outright in some privacy
 * configurations rather than returning null, and an exception here would take
 * the whole page down. A reader who cannot store anything simply gets the
 * signed-out experience.
 */
export function readProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (typeof parsed?.fullName !== 'string' || typeof parsed?.companyName !== 'string') {
      return null;
    }

    return {
      fullName: parsed.fullName,
      companyName: parsed.companyName,
      email: typeof parsed.email === 'string' ? parsed.email : '',
      since: typeof parsed.since === 'string' ? parsed.since : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Returns false when the browser refused to store it, so the caller can say so. */
export function writeProfile(profile: Profile): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored, so nothing needs clearing.
  }
}

/** Whether this browser will remember anything at all. */
export function storageAvailable(): boolean {
  try {
    const probe = '__amryn_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** "Daniel Smith" → "DS". Falls back to a dash rather than rendering nothing. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
