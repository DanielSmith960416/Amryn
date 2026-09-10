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
 * The application is served from the root, so there is no prefix. BASE_PATH
 * in base-path.mjs is the single source for that decision — this reads it
 * rather than repeating the value, and passes it to Next only when it is set,
 * because Next wants the key absent rather than empty.
 *
 * It was '/app' while the plan was to share a domain with the marketing site.
 * See base-path.mjs for why that is on hold and why the helper stays.
 */
import { BASE_PATH } from './base-path.mjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),

  /**
   * How large a file a server action may receive.
   *
   * ── this was a silent defect, and it is worth saying how it failed ───────
   * Next caps a server action's request body at 1 MB unless told otherwise —
   * `defaultBodySizeLimit = '1 MB'` in its action handler, which throws a 413
   * before the action's own code runs. The stocktake importer declares a 5 MB
   * limit and explains, in a comment, why 5 MB is the right number. That
   * limit was never reached: anything over 1 MB was refused by the framework,
   * the action never executed, and `useActionState` was left holding its
   * initial state. To the person doing the counting, the button did nothing.
   *
   * Nothing in the application could have reported it, because nothing in the
   * application ran. The evidence was that the production database held no
   * stocktakes, no import rows, and — the part that named the cause — not one
   * rate-limit row, and the rate limiter is checked *after* the file is
   * accepted. The request was being dropped above our code.
   *
   * So the number lives here, once, above the two limits it has to clear:
   * 5 MB for a stocktake and 10 MB for a document, plus multipart overhead.
   * Raising either of those without raising this reintroduces exactly the same
   * silence, which is why both name this comment.
   */
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },

  /**
   * Left as a real package rather than bundled into a server chunk.
   *
   * unpdf carries Mozilla's pdf.js, which loads pieces of itself at run time.
   * Webpack will happily inline all 1.6 MB of it, and the result compiles,
   * passes every test that imports it directly, and can still fail on the
   * deployed container when pdf.js reaches for a file the bundler did not
   * emit — a failure that would appear for the first time on somebody's
   * upload.
   *
   * Listing it here makes Next trace the package into the standalone output
   * instead, so what runs in production is the published package rather than
   * a re-assembly of it. Verified by the presence of
   * .next/standalone/node_modules/unpdf after a build, which is a thing that
   * can be looked at rather than reasoned about.
   */
  serverExternalPackages: ['unpdf'],

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
