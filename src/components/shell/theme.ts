/**
 * Where the chosen theme is remembered.
 *
 * In its own module, and deliberately not marked `'use client'`, because both
 * a client component and a server component need it — and a server component
 * importing a plain constant from a `'use client'` module does not get the
 * constant. Next replaces that module with a client reference at the boundary,
 * so every non-component export reads `undefined` on the server.
 *
 * That is not a hypothetical. This constant used to live in theme-toggle.tsx,
 * and ThemeScript — a server component — interpolated it into the blocking
 * script that restores the theme before first paint. It rendered
 * `localStorage.getItem(undefined)`, which looks up a key called "undefined",
 * finds nothing, and silently does nothing. So anybody who chose a theme got a
 * flash of the default on every navigation: exactly the thing that script
 * exists to prevent, broken in a way that reads as working.
 */
export const THEME_STORAGE_KEY = 'amryn-theme';

/**
 * Two themes ship: light, and medium — the same interface a stop deeper.
 *
 * A dark theme shipped briefly and was withdrawn. Nothing here needs to know
 * that, except for one thing: an early reader may still have `"dark"` in their
 * `localStorage`. Every read of that key is validated against this list, so a
 * retired value is treated as no choice at all and the reader gets the
 * default rather than an interface with no tokens defined for it.
 */
export type Theme = 'light' | 'medium';

export const THEMES: readonly Theme[] = ['light', 'medium'];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
