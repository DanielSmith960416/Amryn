import type { MetadataRoute } from 'next';

/**
 * What crawlers may index.
 *
 * The operator pages and the signed-in application carry noindex in their own
 * metadata, which is the part search engines actually honour. This is the
 * cruder, earlier signal — it asks them not to fetch at all, which keeps the
 * paths out of crawl logs and out of the hands of anything scanning for
 * exposed admin routes.
 *
 * Neither is access control. /diagnostics, /setup and /api/health are closed
 * by internalAccess(); this only stops them being advertised.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/diagnostics',
        '/setup',
        '/api/',
        // Invitation links carry a token in the path. A crawler following one
        // out of an indexed page would burn a single-use credential, and the
        // recipient would find their invitation already spent.
        '/invite/',
        // Everything behind sign-in. Nothing here is reachable to a crawler
        // anyway, but saying so costs nothing and documents the intent.
        '/command-centre',
        '/settings/',
        '/onboarding',
        '/verify',
        '/reset-password',
      ],
    },
  };
}
