/**
 * The subpath the application is served from.
 *
 * `/app`, because the platform lives at amryn.ai/app: the marketing site holds
 * the root of the domain and Cloudflare routes /app/* to this server.
 *
 * The helper exists because Next only applies the prefix to `next/link` and
 * its own `_next/` assets. An unoptimised `next/image` renders as a plain
 * `<img>` with the src written through untouched, so `/brand/mark.png` would
 * stay `/brand/mark.png` and break on every page. Every hand-written
 * root-relative URL goes through here instead.
 *
 * The value itself lives in base-path.mjs, which next.config.ts reads for
 * `basePath` as well, so the two cannot drift apart — and it is a committed
 * constant rather than an environment variable because basePath is fixed when
 * the bundle is built, and a build that missed the variable would emit an
 * image whose every asset URL is wrong with no runtime setting able to correct
 * it. See base-path.mjs for the full reasoning.
 */
export { BASE_PATH } from '../../base-path.mjs';
import { BASE_PATH } from '../../base-path.mjs';

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
