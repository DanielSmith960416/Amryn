import type { MetadataRoute } from 'next';
import { marketingUrl } from '@/lib/site';

/**
 * What crawlers may index, which depends on where the public face lives.
 *
 * Two deployments carry the same marketing copy — the static site on GitHub
 * Pages and this application's own homepage. Left alone, that is two indexable
 * copies of the same words at two URLs, which splits whatever authority the
 * page earns and leaves search results choosing between them arbitrarily.
 *
 * So `AMRYN_MARKETING_URL` decides. Set it, and the public face is the static
 * site: this deployment is the *application*, and applications are not
 * indexed. Leave it unset, and this deployment is the whole product — its
 * marketing pages are indexed and only the signed-in area is kept out.
 */
export default function robots(): MetadataRoute.Robots {
  const marketing = marketingUrl();

  if (marketing) {
    return {
      rules: { userAgent: '*', disallow: '/' },
      // Still point crawlers at where the real site is, rather than leaving
      // them with a bare refusal.
      host: marketing,
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Every one of these redirects to /sign-in for an anonymous visitor, so
      // crawling them yields nothing but duplicate sign-in pages.
      disallow: [
        '/api/',
        '/command-centre',
        '/digital-twin',
        '/opportunity-radar',
        '/risk-radar',
        '/action-centre',
        '/inventory',
        '/financial',
        '/kpi-centre',
        '/forecast',
        '/market',
        '/decision-log',
        '/reports',
        '/settings',
      ],
    },
  };
}
