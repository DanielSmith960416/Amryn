#!/usr/bin/env node
/**
 * Every package the worker leaves external must actually be resolvable where
 * the worker runs.
 *
 * This exists because it was not, and the way that surfaced was the worker
 * crashlooping in production: `nodemailer` was marked external on the
 * reasoning that Next's tracing would put it in `.next/standalone` the way it
 * does for `pg`. It had not — `pg` is imported by pages the tracer walks,
 * nodemailer only through a server action — and the whole queue stopped on the
 * first boot after deploy, not just the mail.
 *
 * The build itself cannot catch this. esbuild's job is to leave an external
 * import alone, and it does; the failure is at module resolution, which
 * happens on the machine that runs the file. So the check is: for each
 * external, is it in the standalone tree the image ships, or is it copied into
 * the image by hand? If neither, the worker will not start.
 *
 *   node scripts/check-worker-externals.mjs
 *
 * Needs `next build` to have run, because .next/standalone is what it reads.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Read from the build script rather than duplicated here.
 *
 * A second list would be right on the day it was written and wrong on the day
 * somebody added an external — which is the only day this check matters.
 */
const buildScript = readFileSync(join(root, 'scripts/build-worker.mjs'), 'utf8');
const match = /external:\s*\[([^\]]*)\]/.exec(buildScript);
if (!match) {
  console.error('Could not find the `external` list in scripts/build-worker.mjs.');
  process.exit(1);
}

const externals = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const standalone = join(root, '.next/standalone/node_modules');
if (!existsSync(standalone)) {
  console.error(
    'No .next/standalone/node_modules — run `next build` first.\n' +
      'This check reads the tree the image actually ships.',
  );
  process.exit(1);
}

// A package copied into the image by hand counts too. Read the Dockerfile
// rather than keeping a second list of exceptions.
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');

const missing = [];
for (const name of externals) {
  if (existsSync(join(standalone, name, 'package.json'))) continue;
  if (dockerfile.includes(`node_modules/${name}`)) continue;
  missing.push(name);
}

if (missing.length > 0) {
  console.error(
    `The worker marks these external but nothing puts them where it runs: ${missing.join(', ')}.\n` +
      '\n' +
      'The worker will start and immediately die with ERR_MODULE_NOT_FOUND.\n' +
      'Either drop it from `external` in scripts/build-worker.mjs so esbuild\n' +
      'bundles it, or copy it into the runtime image in the Dockerfile.',
  );
  process.exit(1);
}

console.log(
  externals.length === 0
    ? 'The worker bundles everything; nothing to resolve at run time.'
    : `Every worker external resolves where it runs: ${externals.join(', ')}.`,
);
