import { THEME_STORAGE_KEY } from './theme-toggle';

/**
 * Applies the stored theme before the first paint.
 *
 * This has to be a blocking inline script in `<head>`: React cannot help,
 * because by the time a component runs the browser has already painted the
 * default. Without it, a reader who chose dark gets a white flash on every
 * navigation, which is the single most noticeable way a "website that acts like
 * an app" stops feeling like one.
 *
 * The storage read is wrapped because `localStorage` throws outright in some
 * privacy configurations — an exception here would leave the page unstyled.
 */
export function ThemeScript() {
  const script = `
try {
  var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  if (t === 'light' || t === 'medium' || t === 'dark') {
    document.documentElement.dataset.theme = t;
  }
} catch (e) {}
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
