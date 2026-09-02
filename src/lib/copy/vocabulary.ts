/**
 * Words that must not reach a customer.
 *
 * The platform tells people about faults honestly, which is right, and for a
 * while it did so in the vocabulary of whoever built it: a person trying to
 * sign in was told an anon key had been rejected and sent to /diagnostics.
 * Every one of those sentences was accurate. Together they read as somebody
 * else's console, left switched on.
 *
 * The distinction is not "technical words are bad" — it is audience. A
 * customer cannot act on the name of an environment variable, so telling them
 * is not information, it is noise that costs their confidence. The same
 * sentence in a server log is exactly what an operator needs.
 *
 * So the words live here, the operator pages are exempt by path, and a test
 * walks the customer-facing source looking for them. Written down because the
 * next person to add an error message will reach for `error.message`, which is
 * how all of this started.
 */

/** Matched case-insensitively, as whole words, against customer-facing text. */
export const OPERATOR_VOCABULARY: readonly string[] = [
  'migration',
  'migrations',
  'schema',
  'schema cache',
  'RLS',
  'row level security',
  'PostgREST',
  'anon key',
  'service role',
  'service_role',
  'RPC',
  'diagnostics',
  'Supabase',
  'Vercel',
  'PostgreSQL',
  'redeploy',
  'stack trace',
  'localhost',
  'env var',
  'environment variable',
  'NEXT_PUBLIC',
  'SUPABASE_',
  'AI_API_KEY',
  'SMTP_',
  'INTERNAL_ACCESS_TOKEN',
];

/**
 * Paths whose readers are operators, not customers.
 *
 * /diagnostics and /setup exist to name the faulty setting, and are closed by
 * internalAccess(). The libraries beneath them phrase what those pages say.
 * The legal documents are exempt for a different reason: POPIA requires a
 * responsible party to name the operators processing personal information on
 * its behalf, so "Supabase" and "Vercel" appear there as a legal obligation
 * rather than as jargon.
 */
export const EXEMPT_PATHS: readonly string[] = [
  'src/app/diagnostics/',
  'src/app/setup/',
  'src/app/api/health/',
  'src/features/diagnostics/',
  'src/features/setup/',
  'src/lib/db/',
  'src/lib/supabase/',
  'src/lib/env.ts',
  'src/lib/email/',
  'src/lib/legal/',
  'src/app/legal/',
  'src/lib/copy/',
  // The inventory of settings. Its whole readership is whoever configures a
  // deployment, and it exists to say things like "falls back to localhost" and
  // "used to apply migrations" — the sentences this guard is written to keep
  // away from a customer are the ones it is written to provide.
  'src/lib/config/',
  // The operator's activation queue, closed by internalAccess() the same way
  // /diagnostics is.
  'src/app/activations/',
  // Prompts and provider plumbing. The reader there is a model, and asking one
  // for JSON matching a schema is the only way to say it.
  'src/lib/ai/prompts.ts',
  'src/lib/ai/provider.ts',
];
