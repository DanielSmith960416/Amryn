/**
 * The subpath the application is served from, in one place.
 *
 * Empty, and therefore a no-op: the application is served from the root of
 * whatever host it is on — amryn-production.up.railway.app today.
 *
 * ── why the helper stays when the value is empty ──────────────────────────
 * It was '/app' for a while, when the plan was to serve the platform beneath
 * a marketing site sharing one domain. That plan is on hold: the domain's
 * nameservers were never moved, so amryn.ai resolves to a registrar parking
 * page and nothing behind it was ever reachable.
 *
 * Reintroducing the prefix correctly across every hand-written asset URL cost
 * a day and twelve broken images the first time, including the two font
 * preloads that a slow-connection fix depended on. Keeping withBasePath() and
 * the test that enforces it means the next attempt is a one-line change here,
 * not that work again.
 *
 * ── why a constant and not an environment variable ────────────────────────
 * basePath is fixed when the bundle is built, not when the server starts, and
 * the Dockerfile says plainly that whether service variables reach a Docker
 * build differs by host. NEXT_PUBLIC_* survives that because the server
 * rewrites it into the document per request; a base path has no such second
 * chance. A build that missed the variable would emit an image whose every
 * asset URL is wrong, with no runtime setting able to correct it.
 */
export const BASE_PATH = '';
