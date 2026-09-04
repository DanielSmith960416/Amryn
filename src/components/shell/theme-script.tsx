import { THEME_STORAGE_KEY, THEMES } from './theme';

/**
 * Applies the stored theme before the first paint.
 *
 * This has to be a blocking inline script in `<head>`: React cannot help,
 * because by the time a component runs the browser has already painted the
 * default. Without it, a reader who chose medium gets a flash of the lighter
 * theme on every navigation, which is the single most noticeable way a
 * "website that acts like an app" stops feeling like one.
 *
 * The storage read is wrapped because `localStorage` throws outright in some
 * privacy configurations — an exception here would leave the page unstyled.
 *
 * ── the key and the theme names come from ./theme, not from the toggle ────
 * This is a server component. A server component importing a plain constant
 * from a `'use client'` module gets `undefined`, because Next replaces that
 * module with a client reference at the boundary — so this rendered
 * `localStorage.getItem(undefined)` for as long as the constant lived beside
 * the toggle, and the theme was never restored. theme-script.test.ts asserts
 * the import stays on the right side of that boundary.
 *
 * Validating against THEMES is also what retires a theme safely: a reader
 * still holding the withdrawn `"dark"` in storage matches nothing here, so
 * the attribute is never set and they get the default.
 */
export function ThemeScript() {
  const script = `
try {
  var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  if (${THEMES.map((theme) => `t === ${JSON.stringify(theme)}`).join(' || ')}) {
    document.documentElement.dataset.theme = t;
  }
} catch (e) {}
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
