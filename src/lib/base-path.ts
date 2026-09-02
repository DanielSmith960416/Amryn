/**
 * The subpath the site is served from, if any.
 *
 * Normally empty, and therefore normally a no-op: on its own domain the
 * application is served from the root. It exists because the value is not
 * always empty — a preview served under a repository name, or the application
 * mounted beneath a path on a shared host, both need every hand-written URL
 * prefixed, and Next only does that for `next/link` and its own `_next/`
 * assets. An unoptimised `next/image` renders as a plain `<img>` with the src
 * written through untouched, so `/brand/mark.png` stays `/brand/mark.png` and
 * breaks on every page.
 *
 * Keeping the helper rather than deleting it with the static build is
 * deliberate: it costs one function call, and reintroducing it correctly
 * across every image in the application would be a day's work done under
 * pressure. Set `AMRYN_BASE_PATH` and the corresponding `basePath` in
 * `next.config.ts` together, or neither.
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
