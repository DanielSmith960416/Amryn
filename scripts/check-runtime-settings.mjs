#!/usr/bin/env node
/**
 * Asserts that the pages which may need the public settings are not
 * prerendered.
 *
 * The settings reach the browser through `RuntimeEnv` in the root layout,
 * which reads them per request. That is what lets one image run in several
 * places, and lets a build that ran without them still work: set the variable
 * on the service, restart, done.
 *
 * A prerendered page defeats it in the quietest possible way. The component
 * runs once, at build time, when the values are absent; it writes nothing; and
 * the page ships with only the build's inlined `undefined` behind it. Every
 * check passes, the page renders, and the failure appears on somebody else's
 * deployment as an invalid-key message naming a setting that is plainly set.
 *
 * Which pages. Any route where a client component may construct a Supabase
 * browser client — that is the auth pages, where a session is created, and
 * where the fallback would be reached first. Legal pages and the printed
 * reports never touch it and stay static.
 *
 * Run after `next build`, against its own manifest, because the question is
 * about what the build actually produced. Source cannot answer it: a route
 * becomes static by the absence of anything dynamic, so a page opts in to this
 * bug by having nothing written in it.
 */
import { readFile } from 'node:fs/promises';

const MUST_BE_DYNAMIC = ['/sign-in', '/sign-up', '/forgot-password', '/reset-password'];

const manifestPath = new URL('../.next/prerender-manifest.json', import.meta.url);

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(
    'Could not read .next/prerender-manifest.json — run `npm run build` first.\n' +
      `  ${error.message}`,
  );
  process.exit(1);
}

const prerendered = new Set(Object.keys(manifest.routes ?? {}));
const offenders = MUST_BE_DYNAMIC.filter((route) => prerendered.has(route));

if (offenders.length > 0) {
  console.error(
    `These pages were prerendered, so they cannot carry settings read at run time:\n` +
      offenders.map((route) => `  · ${route}`).join('\n') +
      `\n\nThe route group's layout sets \`export const dynamic = 'force-dynamic'\`.\n` +
      `If that was removed, or a page overrode it, put it back — see the note in\n` +
      `src/app/(auth)/layout.tsx for what breaks and where it surfaces.`,
  );
  process.exit(1);
}

console.log(`Settings read at run time: ${MUST_BE_DYNAMIC.length} pages render per request.`);
