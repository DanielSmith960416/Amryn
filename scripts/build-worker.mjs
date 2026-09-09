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
 * `nodemailer` stays external for the same reason and by the same argument: it
 * resolves transports and DNS lookups through conditional requires, and the
 * application imports it to send invitations, so Next's tracing has already
 * put it in the standalone tree the worker runs beside.
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
  external: ['pg', 'nodemailer'],
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
