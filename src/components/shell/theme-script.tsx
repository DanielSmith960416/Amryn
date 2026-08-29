/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders in the default light theme and then swaps,
 * which on a dark-navy product is a white flash in the reader's face. The
 * script is tiny, synchronous and deliberately runs before the body exists.
 */
const SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('amryn.theme');
    if (stored === 'light' || stored === 'medium' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {
    /* Private mode or blocked storage: fall through to the system preference. */
  }
})();
`.trim();

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
