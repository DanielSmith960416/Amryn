#!/usr/bin/env node
/**
 * Bundles the worker into one file.
 *
 * ── why a bundler at all ──────────────────────────────────────────────────
 * The worker has to share the application's code — the engines, the types, the
 * vocabulary — or it will drift from the pages that render what it produced.
 * That code is TypeScript, uses the `@/` alias, and is spread over dozens of
 * files. `tsc` would emit dozens of files with unresolved aliases and no
 * extensions, which Node's ESM loader rejects; the standalone Next build emits
 * a server, not a library. esbuild resolves the alias, follows the imports and
 * writes one file that Node runs directly.
 *
 * ── what is left out, and why ─────────────────────────────────────────────
 * `pg` stays external. It carries an optional native binding it selects at run
 * time, and bundling that kind of conditional require is how a driver ends up
 * working locally and failing in the image. It resolves from node_modules,
 * which the standalone build already contains because the application imports
 * it too.
 *
 * `nodemailer` is bundled rather than external, and that is the opposite of
 * what was tried first. The reasoning that failed went: the application
 * imports it to send invitations, so tracing will have put it in the
 * standalone tree exactly as it does for `pg`. It had not, and the worker
 * crashlooped in production with ERR_MODULE_NOT_FOUND on its first boot after
 * deploy — the whole queue stopped, not just the mail.
 *
 * The difference is that `pg` is imported by pages the tracer walks, while
 * nodemailer is reached only through a server action, and what the tracer puts
 * in .next/standalone is not something to reason about from the outside. So it
 * is bundled: it has no runtime dependencies of its own, and the only
 * conditional requires it makes are for Node builtins, which resolve wherever
 * the file runs.
 *
 *   node scripts/build-worker.mjs
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  entryPoints: [join(root, 'src/worker/main.ts')],
  outfile: join(root, 'dist/worker.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Matches the image and package.json engines. Node 22 in the runner.
  target: 'node20',
  sourcemap: true,
  // Not minified on purpose: the only person who reads a worker stack trace is
  // someone diagnosing a job at an unsociable hour, and the bytes saved buy
  // nothing when the file is never sent over a network.
  minify: false,
  external: ['pg'],
  // The alias tsconfig defines. esbuild does read tsconfig paths, but stating
  // it here means the build does not silently change if that file is
  // reorganised.
  alias: { '@': join(root, 'src') },
  /**
   * `server-only` is a guard for the React bundler, and its default entry
   * throws on import. Anything the worker reaches must not use it — this makes
   * that a build error naming the file rather than a crash on the first tick.
   */
  plugins: [
    {
      name: 'refuse-server-only',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^server-only$/ }, (args) => ({
          errors: [
            {
              text:
                `${args.importer} imports "server-only", so it cannot run in the worker. ` +
                'Move the part the worker needs into a module that does not import it.',
            },
          ],
        }));
      },
    },
  ],
  logLevel: 'info',
});

if (result.errors.length > 0) process.exit(1);
