import type { NextConfig } from 'next';

/**
 * Built as a Node server, deployed behind Cloudflare.
 *
 * ── the decision, and why ─────────────────────────────────────────────────
 * The previous configuration was `output: 'export'` — a fully static build for
 * GitHub Pages. That is a coherent way to ship a demonstration and an
 * impossible way to ship this product: a static export has no server, so it
 * has no server actions, no route handlers, no reading cookies during a
 * request, and therefore no authentication anybody could rely on. The platform
 * holds one company's financial records and must not show them to another, and
 * that guarantee is made by PostgreSQL row level security keyed to a verified
 * session. There is no session without a server.
 *
 * `standalone` emits a self-contained Node server with only the dependencies
 * it actually uses, which is what Railway (or any container host) runs.
 *
 * ── why the application server is not on Cloudflare Workers ───────────────
 * Workers would be the natural pairing with Cloudflare in front, and the app
 * cannot run there: `pg` opens a raw TCP socket to PostgreSQL and `nodemailer`
 * speaks SMTP, neither of which exists in the Workers runtime. Rewriting both
 * to HTTP-only equivalents would mean giving up the direct database connection
 * that /setup uses to apply migrations, which is the thing that made this
 * deployable without a terminal in the first place.
 *
 * So the split is: Cloudflare in front for DNS, CDN, TLS and the firewall;
 * Node behind it for the application. Static assets are cached at the edge by
 * Cloudflare regardless of where they originate.
 *
 * ── basePath ──────────────────────────────────────────────────────────────
 * The platform is served at amryn.ai/app, with the marketing site holding the
 * root of the domain and Cloudflare routing /app/* here. Next needs to know
 * that prefix so it emits `_next/` asset URLs and `next/link` hrefs beneath
 * it; `withBasePath` covers the hand-written URLs Next does not touch.
 *
 * Both read BASE_PATH from base-path.mjs. Two literals that must agree is a
 * bug waiting to happen, and the symptom — pages that render with every image
 * missing — does not point at its cause.
 */
import { BASE_PATH } from './base-path.mjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: BASE_PATH,

  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  eslint: { dirs: ['src'] },

  /**
   * Headers a server can actually send.
   *
   * The static build declared the meta-tag equivalents where one existed and
   * went without where one did not. These are the real thing.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Only meaningful over TLS, which Cloudflare terminates. Two years,
          // and deliberately without preload: preloading is difficult to undo
          // and should be a decision taken once the domain is settled.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
