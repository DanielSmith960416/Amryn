/**
 * www.amryn.ai/app/* → the Railway service.
 *
 * The domain is shared: GitHub Pages serves the marketing site from the root,
 * and the platform lives beneath /app. Those are two different origins, so
 * something has to stand in front of the hostname and decide. This is it.
 *
 * ── why a Worker and not an Origin Rule ───────────────────────────────────
 * An origin rule is the obvious tool and cannot do this on our plan. Routing
 * by path needs two overrides — the resolved DNS record, and the Host header
 * Railway uses to decide which service a request belongs to — and Cloudflare
 * lists both as Enterprise-only. Only the destination-port override is
 * available below that, which is no help here.
 *
 * ── deployment ────────────────────────────────────────────────────────────
 * Kept in the repository rather than only in the dashboard so it can be
 * diffed, reviewed and restored. See cloudflare/README.md for how it is
 * deployed and the route it must be bound to.
 */

const ORIGIN = 'amryn-production.up.railway.app';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    // The path is passed through exactly as it arrived, /app prefix included.
    // Next is built with basePath '/app' and expects to see it; stripping the
    // prefix here would make every route 404 at the origin.
    const upstream = new URL(request.url);
    upstream.protocol = 'https:';
    upstream.hostname = ORIGIN;
    upstream.port = '';

    // Constructing the Request from the upstream URL sets the Host header to
    // the Railway hostname, which is what Railway routes on. That is the whole
    // reason this works without registering a custom domain there.
    const proxied = new Request(upstream, request);
    proxied.headers.set('X-Forwarded-Host', incoming.hostname);
    proxied.headers.set('X-Forwarded-Proto', 'https');

    // Manual, so a 307 from the authentication middleware reaches the browser
    // rather than being followed here — following it would return the signed
    // -out page's body under the original URL and the address bar would lie.
    const response = await fetch(proxied, { redirect: 'manual' });

    const location = response.headers.get('location');
    if (!location) return response;

    // The application builds redirects from the Host it was handed, which is
    // Railway's. Left alone, following one would carry a customer off
    // www.amryn.ai and onto amryn-production.up.railway.app — out of the
    // domain they trust, and with a session cookie that does not follow them.
    const rewritten = new Response(response.body, response);
    rewritten.headers.set(
      'location',
      location.replace(`https://${ORIGIN}`, `https://${incoming.hostname}`),
    );
    return rewritten;
  },
};
