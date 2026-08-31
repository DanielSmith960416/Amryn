/**
 * Where the public marketing site lives, if it is somewhere other than here.
 *
 * The product can be deployed two ways, and this one variable is the whole
 * difference between them:
 *
 *   **Set** — the static site (GitHub Pages, or a domain pointing at it) is the
 *   public face, and this deployment is the application it links into. The
 *   application's own homepage stays reachable, for anyone who bookmarked it,
 *   but it defers: it is not indexed, and it declares the marketing site as its
 *   canonical URL so the two copies of the same copy do not compete.
 *
 *   **Unset** — this deployment is the whole product, marketing pages included.
 *
 * Returns null rather than an empty string so callers cannot accidentally treat
 * "not configured" as a usable URL, and normalises the trailing slash so
 * concatenating a path never produces a doubled one.
 */
export function marketingUrl(): string | null {
  const raw = process.env.AMRYN_MARKETING_URL?.trim();
  if (!raw) return null;

  // A relative or malformed value would produce a broken canonical tag, which
  // is worse than none: it tells a crawler to index a URL that does not exist.
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}
