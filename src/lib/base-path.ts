/**
 * The subpath this site is served from.
 *
 * GitHub Pages serves a project repository under its own name —
 * `danielsmith960416.github.io/Amryn` — so every absolute URL the site emits
 * needs that prefix. Next applies it to `next/link` and to its own `_next/`
 * assets automatically.
 *
 * It does **not** apply it to the `src` of an unoptimised `next/image`, which
 * is what a static export uses: those render as a plain `<img>` with the src
 * written through untouched, and a `/brand/mark.png` that should have been
 * `/Amryn/brand/mark.png` is a broken image on every page. Hence this helper,
 * and hence its use on every image and icon the site declares.
 *
 * The value is inlined at build time by `env` in `next.config.ts`, so it is the
 * same string on the server and in the browser, and a custom domain serving
 * from the root can set `AMRYN_BASE_PATH=""` and have everything follow.
 */
export const BASE_PATH = process.env.AMRYN_BASE_PATH ?? '';

/**
 * Prefixes a root-relative path with the base path.
 *
 * Anything already absolute — an external URL, a data URI — is returned
 * untouched, so a caller need not check first.
 */
export function withBasePath(path: string): string {
  if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  if (!path.startsWith('/')) return path;
  return `${BASE_PATH}${path}`;
}
