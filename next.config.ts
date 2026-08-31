import type { NextConfig } from 'next';

/**
 * Built as a fully static site, for GitHub Pages.
 *
 * `output: 'export'` renders every page to HTML at build time and emits no
 * server. That is the whole point of this deployment: no hosting account, no
 * environment variables, no service to configure or pay for. It is also a real
 * constraint, and one worth stating where someone will read it before wondering
 * why a feature is missing.
 *
 * What a static export cannot have:
 *
 *   · **Server-side anything.** No API routes, no server actions, no reading
 *     cookies or headers during a request. Every page is the same HTML for
 *     everyone who asks for it.
 *   · **Real authentication.** There is no server to check a password against
 *     and no secret to sign a session with. The client area is gated on the
 *     device, which keeps the product feeling like an app — but it is a door,
 *     not a lock, and `src/lib/profile.ts` says so at length.
 *
 * Both are acceptable while the platform shows demonstration data and nothing
 * else. Neither is acceptable once a real client's figures are in it. The
 * README sets out what moving back to a server costs.
 */

/**
 * The site is served from a repository subpath — danielsmith960416.github.io/Amryn
 * — so every internal link and asset URL needs that prefix. `next/link` and
 * `next/image` apply it themselves; anything hand-written must use
 * `withBasePath` from `src/lib/base-path.ts`.
 *
 * A custom domain serves from the root instead, so this is overridable rather
 * than hard-coded: set `AMRYN_BASE_PATH=""` in that case.
 */
const basePath = process.env.AMRYN_BASE_PATH ?? '/Amryn';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  // Emits `about/index.html` rather than `about.html`, which is what a static
  // file server needs in order to serve `/about` without a redirect.
  trailingSlash: true,
  // The image optimiser is a server. Without one, images are served as authored.
  images: { unoptimized: true },
  // Inlined at build time so `withBasePath` resolves to the same string in the
  // browser as it does while rendering.
  env: { AMRYN_BASE_PATH: basePath },
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  eslint: { dirs: ['src'] },

  // No `headers()`: a static export has no server to send them. The equivalent
  // protections are declared as meta tags in the root layout where a meta
  // equivalent exists, and are simply unavailable where one does not.
};

export default nextConfig;
