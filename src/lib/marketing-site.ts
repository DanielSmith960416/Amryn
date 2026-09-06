/**
 * Where the marketing site lives, in one place.
 *
 * There is one marketing site and it is not this application. It is the static
 * site in `docs/`, served by GitHub Pages, and it holds the positioning, the
 * Command Centre demonstration and the way in — its "Open the platform" button.
 * This server holds the platform and nothing else.
 *
 * That split was not always kept. The application used to serve its own
 * marketing homepage at `/`: the same headline, the same three explanatory
 * bands, the same closing call to action, maintained twice and able to
 * disagree with itself. Two front doors is one too many — a stranger who found
 * the Railway host read a different, staler pitch than the one being linked to
 * everywhere else, and every copy change had to be made in two languages, in
 * two repositories' worth of markup, to stay true.
 *
 * ── the mirror of APP_URL ─────────────────────────────────────────────────
 * `docs/app.js` holds a single `APP_URL` naming this server, and every way
 * into the platform is pointed at it from that one value. This is the same
 * arrangement facing the other way: every way back out to the marketing site
 * is pointed here. When the domain moves, those are the two lines to change.
 *
 * A constant rather than an environment variable, because it is the address of
 * a public site rather than a secret or a per-deployment detail, and a link
 * that silently disappears when a variable is unset is worse than one that is
 * wrong in a way review can see.
 */
export const MARKETING_SITE_URL = 'https://danielsmith960416.github.io/Amryn/';
