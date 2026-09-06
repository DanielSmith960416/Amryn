#!/usr/bin/env node
/**
 * Refuses a build whose browser bundle contains a secret.
 *
 * Next inlines `process.env.<NAME>` into client code at build time. That is the
 * intended behaviour for NEXT_PUBLIC_* and a disaster for anything else: one
 * import of a server module from a component that turns out to be a client
 * component, and the service role key — which bypasses every row level
 * security policy in the database — is sitting in a JavaScript file served to
 * anybody who visits the sign-in page. Nothing about the page would look
 * wrong.
 *
 * ── what each check is actually worth ─────────────────────────────────────
 * Measured rather than assumed, because a security check nobody has seen fail
 * is indistinguishable from one that cannot.
 *
 * The pattern and JWT checks are the ones that run in CI and do the work. The
 * JWT check is the one this repository most needs: Supabase's anon key and its
 * service role key are both JWTs signed with the same secret and differ only
 * in a claim, so a rule about JWTs would have to allow both or refuse both.
 * Reading the claim is the only way to tell a key that belongs in the browser
 * from one that bypasses every policy in the database.
 *
 * The canaries cover a narrower case than they first appear to. Next inlines
 * only NEXT_PUBLIC_* into client code — building this application with every
 * server-only setting set to a unique value puts none of them anywhere in
 * .next, which was confirmed by doing it. What they would catch is a secret
 * reaching a *prerendered document*: a server component that reads one and
 * passes it to a client component as a prop, which lands in the payload
 * embedded in the HTML and is as public as a script file. That has not
 * happened here and is exactly the kind of thing that happens once.
 *
 *   node scripts/check-bundle-secrets.mjs
 *
 * Expects a build in .next. `--canary-env` prints the assignments to build
 * with, for that deeper pass — worth running when changing how settings are
 * read, and not worth a second build on every pull request.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Everything read only on the server.
 *
 * Kept complete by hand, and that is a real risk: a setting added to the
 * application and forgotten here is a setting this check does not cover. The
 * cross-check below catches the common half of that — any variable used in the
 * source that is neither listed here nor public is reported — so forgetting
 * has a symptom.
 */
const SERVER_ONLY = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'SMTP_PASSWORD',
  'SMTP_USER',
  'SMTP_HOST',
  'AI_API_KEY',
  'AI_GATEWAY_TOKEN',
  'INTERNAL_ACCESS_TOKEN',
];

/** The canary for one setting. Deterministic, so a failure names the setting. */
const canaryFor = (name) => `AMRYN_CANARY_${name}_d41d8cd98f00b204e9800998ecf8427e`;

if (process.argv.includes('--canary-env')) {
  // Printed as shell assignments so CI can `eval` them rather than restating
  // the list — two copies of it would drift the first time one is added.
  for (const name of SERVER_ONLY) console.log(`${name}=${canaryFor(name)}`);
  process.exit(0);
}

/* ── what to read ─────────────────────────────────────────────────────────
 *
 * .next/static is the browser bundle. The prerendered HTML matters just as
 * much and is easy to forget: a value inlined into a server component's output
 * is in the document, which is as public as a script file.
 */
const TARGETS = [
  join(root, '.next', 'static'),
  join(root, '.next', 'server', 'app'),
];
const READ_EXTENSIONS = ['.js', '.mjs', '.cjs', '.html', '.json', '.txt', '.css', '.rsc'];

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* files(path);
    } else if (READ_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      yield path;
    }
  }
}

const findings = [];
const report = (file, what, detail) =>
  findings.push({ file: relative(root, file), what, detail });

/* ── the shape checks ────────────────────────────────────────────────────
 *
 * For credentials that were never in an environment variable to begin with.
 */
const PATTERNS = [
  {
    what: 'a PostgreSQL connection string carrying a password',
    // Only with credentials in it. A bare host is not a secret and appears in
    // documentation strings the bundle legitimately contains.
    re: /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`@]+@/g,
  },
  { what: 'an Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { what: 'an OpenAI API key', re: /\bsk-proj-[A-Za-z0-9_-]{20,}/g },
  { what: 'a Resend API key', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g },
  { what: 'a Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{16,}/g },
  { what: 'a Supabase personal access token', re: /\bsbp_[a-f0-9]{40,}/g },
  { what: 'a private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/**
 * The one credential shaped exactly like a legitimate one.
 *
 * Supabase's anon key and service role key are both JWTs signed with the same
 * secret and differ only in a claim. The anon key belongs in the bundle — the
 * browser cannot talk to Supabase without it — so a rule about JWTs would
 * either allow both or refuse both. Reading the claim is the only way to tell
 * them apart, and it is the check most worth having in this repository.
 */
function checkJwts(text, file) {
  const jwt = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}\b/g;
  for (const match of text.matchAll(jwt)) {
    let claims;
    try {
      claims = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    } catch {
      // Not a JWT after all, or one this check cannot read. The canaries cover
      // the case where it is a real key from a known setting.
      continue;
    }
    const role = typeof claims?.role === 'string' ? claims.role : null;
    if (role && role !== 'anon') {
      report(file, `a Supabase JWT with role "${role}"`, 'only the anon key may reach a browser');
    }
  }
}

let scanned = 0;
for (const dir of TARGETS) {
  for (const file of files(dir)) {
    const text = readFileSync(file, 'utf8');
    scanned += 1;

    for (const name of SERVER_ONLY) {
      if (text.includes(canaryFor(name))) {
        report(file, `${name}`, 'its canary value is in the bundle, so the real value would be too');
      }
      // Belt and braces: the real value, when the scan runs against a build
      // that had real settings rather than canaries.
      const actual = process.env[name];
      if (actual && actual.length >= 12 && !actual.startsWith('AMRYN_CANARY_') && text.includes(actual)) {
        report(file, `${name}`, 'its actual value is in the bundle');
      }
    }

    for (const { what, re } of PATTERNS) {
      const match = re.exec(text);
      re.lastIndex = 0;
      if (match) report(file, what, `matched ${match[0].slice(0, 12)}…`);
    }

    checkJwts(text, file);
  }
}

if (scanned === 0) {
  console.error(
    'Nothing to scan: no build was found in .next/static or .next/server/app.\n' +
      'Run `npm run build` first — a scan of nothing passing is worse than no scan.',
  );
  process.exit(1);
}

/* ── the list above, kept honest ──────────────────────────────────────────
 *
 * A setting the application reads that is neither public nor on the list is
 * one this check silently does not cover. Reported rather than failed: the
 * platform-supplied ones (PORT, RAILWAY_*, and so on) are legitimately neither.
 */
const KNOWN_PUBLIC = /^(NEXT_PUBLIC_|NODE_ENV$|PORT$|TZ$|PG[A-Z]+$|JOBS_|PAYMENT_|SMTP_(FROM|PORT|SECURE)$)/;
const PLATFORM = /^(RAILWAY_|RENDER_|CF_PAGES_|GITHUB_|FLY_|SOURCE_COMMIT$|AI_(PROVIDER|MODEL|EFFORT|MAX_OUTPUT_TOKENS|BASE_URL)$)/;

const used = new Set();
for (const dir of ['src', 'scripts']) {
  for (const file of files(join(root, dir))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
      used.add(match[1]);
    }
  }
}
const uncovered = [...used]
  .filter((name) => !SERVER_ONLY.includes(name) && !KNOWN_PUBLIC.test(name) && !PLATFORM.test(name))
  .sort();

if (uncovered.length > 0) {
  console.log(
    `Note: ${uncovered.join(', ')} ${uncovered.length === 1 ? 'is' : 'are'} read from the ` +
      'environment and not classified in scripts/check-bundle-secrets.mjs. If any of them ' +
      'is a secret, add it to SERVER_ONLY.',
  );
}

if (findings.length > 0) {
  console.error(`\nA secret reached the browser bundle. ${findings.length} finding(s):\n`);
  for (const finding of findings) {
    console.error(`  ${finding.file}`);
    console.error(`    ${finding.what} — ${finding.detail}\n`);
  }
  console.error(
    'This is not a warning. Anything in .next/static or a prerendered document is served\n' +
      'to every visitor. Find the client component that imports the server module and cut\n' +
      'the import; "use server" and server-only exist to make that a build error.',
  );
  process.exit(1);
}

console.log(`No secrets in ${scanned} bundled files.`);
