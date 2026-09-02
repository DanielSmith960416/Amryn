import 'server-only';


/**
 * The public settings, handed to the browser at request time.
 *
 * Next inlines `process.env.NEXT_PUBLIC_*` into the browser bundle when the
 * application is *built*. That is a sound default and a poor fit for a
 * container: the image is built once and run in several places, so a setting
 * baked in at build time cannot differ between them, and changing one means a
 * rebuild rather than a restart.
 *
 * It also produced the single worst first-deployment failure this product has.
 * A build that ran without the variables emits a bundle carrying `undefined`,
 * and the first symptom is the sign-in page reporting an invalid API key — a
 * message about a key, caused by a missing URL, in a deployment where both
 * settings are plainly present in the dashboard. Every host differs on whether
 * service variables reach a Docker build, which turned a one-line setting into
 * a question about a platform's build semantics.
 *
 * So the server reads them per request and writes them here, and the browser
 * prefers what it finds. Set the variable, restart, done.
 *
 * ── this exposes nothing new ──────────────────────────────────────────────
 * Both values are public by design and were already being shipped to the
 * browser inside the JavaScript bundle. Moving them into the document changes
 * where they are written, not who can read them. The anon key grants nothing
 * on its own: every row it can reach is decided by Row Level Security against
 * a verified session. The service role key is not here and must never be.
 */
export function RuntimeEnv() {
  // Trimmed, and an empty string counts as absent — a variable set to blank in
  // a dashboard is a variable somebody meant to unset.
  const read = (value: string | undefined) => value?.trim() ?? '';

  const values = {
    NEXT_PUBLIC_SUPABASE_URL: read(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: read(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_SITE_URL: read(process.env.NEXT_PUBLIC_SITE_URL),
  };

  // Nothing is written when nothing is set, so a deployment that does bake the
  // values in at build time is left exactly as it was.
  if (!values.NEXT_PUBLIC_SUPABASE_URL && !values.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;

  return (
    <script
      // JSON.stringify twice: once for the object, once to make it a JavaScript
      // string literal that cannot terminate the script element early. A value
      // containing "</script>" would otherwise end it and put the rest of the
      // settings into the document as markup.
      dangerouslySetInnerHTML={{
        __html: `window.__AMRYN_ENV__=JSON.parse(${JSON.stringify(JSON.stringify(values))})`,
      }}
    />
  );
}
