/**
 * Where the application is served from, in one place.
 *
 * The platform lives at amryn.ai/app: the marketing site holds the root of the
 * domain, and Cloudflare routes /app/* to this server. Next needs that prefix
 * at `basePath` in next.config.ts, and every hand-written asset URL needs it
 * through withBasePath(). Those two must agree or the application is broken in
 * a way that is tedious to diagnose — the pages render and every image 404s.
 *
 * ── why a constant and not an environment variable ────────────────────────
 * The obvious version reads AMRYN_BASE_PATH, and it is a trap here. basePath
 * is fixed when the bundle is built, not when the server starts, and the
 * Dockerfile says plainly that whether service variables reach a Docker build
 * differs by host. NEXT_PUBLIC_* survives that because the server rewrites it
 * into the document per request; a base path has no such second chance. A
 * build that missed the variable would emit an image whose every asset URL is
 * wrong, with no runtime setting able to correct it.
 *
 * So it is committed. Changing where the application is served is a change to
 * this file and a rebuild, which is honest about what it actually is.
 */
export const BASE_PATH = '/app';
