#!/usr/bin/env node
/**
 * Runs the built worker the way the image runs it, and checks it gets as far
 * as its own configuration.
 *
 * ── why this exists, and why the two checks before it did not catch it ────
 *
 * The worker was taken down twice in one evening by module loading, and both
 * times something green was mistaken for proof:
 *
 *   1. `nodemailer` was marked external on the reasoning that Next's tracing
 *      would put it in the standalone tree. It had not. The build was green
 *      because esbuild's job with an external is to leave the import alone,
 *      and it did that correctly — resolution happens on the machine that
 *      runs the file.
 *
 *   2. Bundling it instead moved the failure rather than fixing it: esbuild's
 *      ESM output shims `require` with a function that throws, and nodemailer
 *      asks for `events` at run time. The check written for (1) still passed,
 *      because it only asked whether externals resolve.
 *
 * Between those, the failure was "verified" locally with `node -e
 * "import('./dist/worker.mjs')"`, which passed — and was worthless. That runs
 * in a CommonJS context where a real `require` is in scope, so esbuild's shim
 * found one and worked. The image runs `node dist/worker.mjs`, an ESM entry
 * point with no `require` anywhere, and threw.
 *
 * So the check is not a cleverer static analysis. It is: start the program the
 * way production starts it, and see whether it starts. Anything short of that
 * has now been wrong twice.
 *
 * ── it does not replace check-worker-externals.mjs ────────────────────────
 *
 * This catches (2) and not (1), and that is not an oversight. Here,
 * node_modules is the repository's, so an external the image would lack still
 * resolves and the worker starts perfectly. Only the image is missing it.
 * check-worker-externals.mjs is what reads the tree the image actually ships.
 *
 * Two checks, two different failures, and each is blind to the other's. Verified
 * by running both against both crashes rather than by reasoning about it —
 * which is how this file came to exist in the first place.
 *
 * ── how it decides ────────────────────────────────────────────────────────
 *
 * With no SUPABASE_DB_URL the worker refuses to start and says so. That
 * refusal is the success condition here: reaching it means the entire module
 * graph loaded. What fails this check is dying before that — a missing
 * package, a dynamic require, a bad import — because those are the failures
 * that leave the queue down with nobody watching.
 *
 *   node scripts/check-worker-boots.mjs
 *
 * Needs `npm run build:worker` to have run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = join(root, 'dist/worker.mjs');

if (!existsSync(worker)) {
  console.error('dist/worker.mjs is missing — run `npm run build:worker` first.');
  process.exit(1);
}

/*
 * A clean environment, so a SUPABASE_DB_URL that happens to be set on the
 * machine running this does not turn the check into a real worker that polls
 * a real queue. PATH is kept because Node needs it.
 */
const result = spawnSync(process.execPath, [worker], {
  cwd: root,
  encoding: 'utf8',
  timeout: 60_000,
  env: { PATH: process.env.PATH, NODE_ENV: 'production' },
});

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

/** The failures that mean the program never started. */
const FATAL = [
  { pattern: /ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module/, name: 'a package it could not resolve' },
  { pattern: /Dynamic require of/, name: 'a dynamic require esbuild could not bundle' },
  { pattern: /ERR_REQUIRE_ESM|ERR_UNSUPPORTED_DIR_IMPORT/, name: 'a module-format mismatch' },
  { pattern: /SyntaxError/, name: 'a syntax error in the bundle' },
];

for (const { pattern, name } of FATAL) {
  if (pattern.test(output)) {
    console.error(
      `The worker did not start: ${name}.\n\n` +
        `${output.trim().split('\n').slice(0, 12).join('\n')}\n\n` +
        'This is what the container would do on every boot, so the queue would\n' +
        'be down — every schedule, not only the handler that pulled in the\n' +
        'dependency. Fix the bundle rather than the deployment.',
    );
    process.exit(1);
  }
}

// The refusal that means everything loaded.
if (!/SUPABASE_DB_URL is not set/.test(output)) {
  console.error(
    'The worker neither refused for want of SUPABASE_DB_URL nor failed in a way\n' +
      'this check recognises. That is not necessarily a fault, but it means this\n' +
      'check no longer knows what it is looking at — read the output and either\n' +
      'fix the worker or teach this script the new startup message.\n\n' +
      `exit code: ${result.status}\n${output.trim().slice(0, 800)}`,
  );
  process.exit(1);
}

console.log('The worker loads and reaches its own configuration check.');
