/**
 * Every setting this deployment reads, and where each one has to be set.
 *
 * Written down because "where does this variable go" was answered four times
 * in a row by grepping, and because two of the answers are not obvious:
 *
 *   · A NEXT_PUBLIC_* value is inlined into the browser bundle when the image
 *     is built, not read when the server starts. Setting one only at run time
 *     produces a build carrying `undefined`, and the first symptom is a
 *     sign-in page reporting an invalid key — a message about a key, caused by
 *     a missing URL.
 *   · Several are set by the host, not by us. Asking somebody to configure
 *     RAILWAY_PUBLIC_DOMAIN wastes their time and, if they get it wrong,
 *     breaks every link in an email.
 *
 * The list is asserted against .env.example by a test, so a setting added to
 * the code and not to the example is a failing test rather than a support call
 * six weeks later.
 */

export type Stage =
  /**
   * Reaches the browser. Read at run time and written into the document, so
   * setting it on the service is enough; it may also be inlined at build time,
   * which is optional and no longer the thing that catches people out.
   */
  | 'build'
  /** Read by the running server. */
  | 'runtime'
  /** Set by the platform. Nobody types these in. */
  | 'platform'
  /** Only used by scripts on a developer's machine or in CI. */
  | 'tooling';

export interface Setting {
  name: string;
  stage: Stage;
  required: boolean;
  /** True where the value grants access and must never be printed or logged. */
  secret: boolean;
  purpose: string;
  /** What happens without it, in the words a person would use. */
  withoutIt: string;
}

export const SETTINGS: readonly Setting[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    stage: 'build',
    required: true,
    secret: false,
    purpose: 'Where the database and authentication live.',
    withoutIt: 'Nobody can sign in, and the sign-in page reports an invalid key.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    stage: 'build',
    required: true,
    secret: false,
    purpose:
      'The public key the browser signs in with. Public by design — every row it can reach is decided by Row Level Security, not by the key.',
    withoutIt: 'Nobody can sign in.',
  },
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    stage: 'build',
    required: false,
    secret: false,
    purpose:
      'The address to put in emails and redirects. Falls back to whatever the host reports, which is right for a preview and wrong for production behind a custom domain.',
    withoutIt: 'Invitation and password links point at the platform hostname rather than your own.',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    stage: 'runtime',
    required: true,
    secret: true,
    purpose:
      'Bypasses Row Level Security. Used for confirming a payment, the activation queue, and administrative repairs.',
    withoutIt: 'Payments cannot be confirmed and activation links cannot be issued.',
  },
  {
    name: 'SUPABASE_DB_URL',
    stage: 'runtime',
    required: false,
    secret: true,
    purpose: 'A direct connection, used to apply migrations from /setup or a terminal.',
    withoutIt: 'Migrations have to be pasted into a SQL editor by hand.',
  },
  {
    name: 'INTERNAL_ACCESS_TOKEN',
    stage: 'runtime',
    required: false,
    secret: true,
    purpose:
      'The way in to the operator pages when nobody can sign in — which is exactly when they are needed.',
    withoutIt: 'Operator pages are reachable only by a signed-in administrator.',
  },
  {
    name: 'SMTP_HOST',
    stage: 'runtime',
    required: false,
    secret: false,
    purpose: 'The mail service that sends invitations and activation links.',
    withoutIt: 'Links are shown on screen to be passed on by hand instead of emailed.',
  },
  { name: 'SMTP_PORT', stage: 'runtime', required: false, secret: false, purpose: 'The port the mail service listens on.', withoutIt: 'Defaults to 587.' },
  { name: 'SMTP_USER', stage: 'runtime', required: false, secret: false, purpose: 'The account the mail service authenticates as.', withoutIt: 'No mail is sent; links are shown on screen.' },
  { name: 'SMTP_PASSWORD', stage: 'runtime', required: false, secret: true, purpose: 'The password for that account.', withoutIt: 'No mail is sent; links are shown on screen.' },
  { name: 'SMTP_FROM', stage: 'runtime', required: false, secret: false, purpose: 'The address mail appears to come from.', withoutIt: 'No mail is sent; links are shown on screen.' },
  { name: 'SMTP_SECURE', stage: 'runtime', required: false, secret: false, purpose: 'Whether to connect over TLS from the first byte.', withoutIt: 'Inferred from the port.' },

  {
    name: 'PAYMENT_ACCOUNT_NAME',
    stage: 'runtime',
    required: false,
    secret: false,
    purpose: 'The banking details a customer transfers to. All five are needed together.',
    withoutIt: 'The billing page reserves a reference and asks the customer to email for details.',
  },
  { name: 'PAYMENT_BANK', stage: 'runtime', required: false, secret: false, purpose: 'Which bank the account is held at.', withoutIt: 'No banking details are shown; the reference is still reserved.' },
  { name: 'PAYMENT_ACCOUNT_NUMBER', stage: 'runtime', required: false, secret: false, purpose: 'The account a customer transfers to.', withoutIt: 'No banking details are shown; the reference is still reserved.' },
  { name: 'PAYMENT_BRANCH_CODE', stage: 'runtime', required: false, secret: false, purpose: 'The branch code a South African transfer needs.', withoutIt: 'No banking details are shown; the reference is still reserved.' },
  { name: 'PAYMENT_PROOF_EMAIL', stage: 'runtime', required: false, secret: false, purpose: 'Where a customer emails proof of payment.', withoutIt: 'No banking details are shown; the reference is still reserved.' },
  { name: 'PAYMENT_SWIFT', stage: 'runtime', required: false, secret: false, purpose: 'The SWIFT code, for payments from outside South Africa.', withoutIt: 'Not shown, which is fine for a domestic transfer.' },

  {
    name: 'AI_PROVIDER',
    stage: 'runtime',
    required: false,
    secret: false,
    purpose: 'Which model service to use, if any.',
    withoutIt: 'The analytical engines run on their own; the assistant is unavailable.',
  },
  { name: 'AI_API_KEY', stage: 'runtime', required: false, secret: true, purpose: 'The key for the model service.', withoutIt: 'The analytical engines run on their own; the assistant is unavailable.' },
  { name: 'AI_MODEL', stage: 'runtime', required: false, secret: false, purpose: 'A specific model, where the provider default is not wanted.', withoutIt: "The provider's default is used." },
  { name: 'AI_MAX_OUTPUT_TOKENS', stage: 'runtime', required: false, secret: false, purpose: 'The ceiling on a single answer from the model.', withoutIt: 'Defaults to a sensible ceiling.' },
  { name: 'AI_EFFORT', stage: 'runtime', required: false, secret: false, purpose: 'How hard the model works; read by Anthropic models only.', withoutIt: 'Defaults to high.' },

  {
    name: 'AMRYN_ENABLE_EXTERNAL_RADAR',
    stage: 'runtime',
    required: false,
    secret: false,
    purpose: 'Turns on live market scanning connectors.',
    withoutIt: 'Market intelligence runs on what has been imported.',
  },

  // Set by the platform. Listed so that nobody sets them, and so the
  // diagnostics page can say where its build information came from.
  { name: 'PORT', stage: 'platform', required: false, secret: false, purpose: 'The port the host expects the server to listen on.', withoutIt: 'Defaults to 3000.' },
  { name: 'NODE_ENV', stage: 'platform', required: false, secret: false, purpose: 'Set to production inside the image; never set by hand.', withoutIt: 'Development behaviour in production.' },
  { name: 'RAILWAY_PUBLIC_DOMAIN', stage: 'platform', required: false, secret: false, purpose: 'What Railway calls this service, used where no site URL is configured.', withoutIt: 'Falls back to localhost.' },
  { name: 'RAILWAY_GIT_BRANCH', stage: 'platform', required: false, secret: false, purpose: 'The branch Railway deployed, shown on the operator pages.', withoutIt: 'The build stamp is blank.' },
  { name: 'RAILWAY_GIT_COMMIT_SHA', stage: 'platform', required: false, secret: false, purpose: 'The commit Railway deployed, shown on the operator pages.', withoutIt: 'The build stamp is blank.' },
  { name: 'CF_PAGES_URL', stage: 'platform', required: false, secret: false, purpose: 'What Cloudflare Pages calls this build, used where no site URL is configured.', withoutIt: 'Falls back to localhost.' },
  { name: 'CF_PAGES_BRANCH', stage: 'platform', required: false, secret: false, purpose: 'The branch Cloudflare Pages built, shown on the operator pages.', withoutIt: 'The build stamp is blank.' },
  { name: 'CF_PAGES_COMMIT_SHA', stage: 'platform', required: false, secret: false, purpose: 'The commit Cloudflare Pages built, shown on the operator pages.', withoutIt: 'The build stamp is blank.' },
  { name: 'RENDER_EXTERNAL_URL', stage: 'platform', required: false, secret: false, purpose: 'What Render calls this service, used where no site URL is configured.', withoutIt: 'Falls back to localhost.' },
  { name: 'RENDER_GIT_BRANCH', stage: 'platform', required: false, secret: false, purpose: 'The branch Render built, shown on the operator pages.', withoutIt: 'The build stamp is blank.' },
  { name: 'RENDER_GIT_COMMIT', stage: 'platform', required: false, secret: false, purpose: 'The commit Render built, shown on the operator pages.', withoutIt: 'The build stamp is blank.' },
  { name: 'FLY_APP_NAME', stage: 'platform', required: false, secret: false, purpose: 'What Fly calls this application, used where no site URL is configured.', withoutIt: 'Falls back to localhost.' },
  { name: 'SOURCE_COMMIT', stage: 'platform', required: false, secret: false, purpose: 'A generic commit stamp some hosts set, shown on the operator pages.', withoutIt: 'The build stamp is blank.' },
  { name: 'GITHUB_REF_NAME', stage: 'platform', required: false, secret: false, purpose: 'The branch, when the build runs inside GitHub Actions.', withoutIt: 'The build stamp is blank.' },
  { name: 'GITHUB_SHA', stage: 'platform', required: false, secret: false, purpose: 'The commit, when the build runs inside GitHub Actions.', withoutIt: 'The build stamp is blank.' },

  // Used only by the test harness and the type generator.
  { name: 'PGHOST', stage: 'tooling', required: false, secret: false, purpose: 'Where the schema tests find a local PostgreSQL.', withoutIt: 'Defaults to /var/tmp.' },
  { name: 'PGPORT', stage: 'tooling', required: false, secret: false, purpose: 'The port that local PostgreSQL listens on.', withoutIt: 'Defaults to 55432.' },
  { name: 'PGUSER', stage: 'tooling', required: false, secret: false, purpose: 'The role the schema tests connect as.', withoutIt: 'Defaults to postgres.' },
  { name: 'PGDATABASE', stage: 'tooling', required: false, secret: false, purpose: 'The database the schema tests build and tear down.', withoutIt: 'Defaults to amryn_test.' },
];

export function settingsFor(stage: Stage): Setting[] {
  return SETTINGS.filter((s) => s.stage === stage);
}

/** The ones a deployment cannot start without. */
export function requiredSettings(): Setting[] {
  return SETTINGS.filter((s) => s.required);
}

/** Set by us rather than by the host, so worth documenting in .env.example. */
export function documented(): Setting[] {
  return SETTINGS.filter((s) => s.stage === 'build' || s.stage === 'runtime');
}
