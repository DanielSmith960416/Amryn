import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS, documented, requiredSettings, settingsFor } from './environment';

const root = join(import.meta.dirname, '..', '..', '..');

/**
 * The inventory is only useful if it is true.
 *
 * Three ways it could stop being: a setting added to the code and not to the
 * list, a setting on the list that nothing reads any more, and a setting on
 * the list that .env.example never mentions. All three are silent, and all
 * three surface as somebody's deployment not working for a reason nothing in
 * the product can explain. So all three are asserted here.
 */

/**
 * Every environment read in the source, from the source rather than from
 * memory.
 *
 * The inventory and this file are excluded, and not as a convenience: both
 * describe environment reads rather than performing any, so their prose is
 * indistinguishable from a real one to a grep. Leaving them in made the test
 * demand an entry for a variable named `X` that only ever existed in a
 * sentence explaining what the test does.
 */
function readsInSource(): Set<string> {
  const out = execFileSync(
    'git',
    [
      'grep',
      '-hoE',
      'process\\.env\\.[A-Z0-9_]+',
      '--',
      'src',
      'scripts',
      'next.config.ts',
      ':(exclude)src/lib/config/environment.ts',
      ':(exclude)src/lib/config/environment.test.ts',
    ],
    { cwd: root, encoding: 'utf8' },
  );

  const names = new Set<string>();
  for (const line of out.split('\n')) {
    const name = line.trim().replace('process.env.', '');
    // `process.env.NEXT_PUBLIC_` appears as a prefix test rather than as a
    // variable — publicEnv() checks what a name starts with.
    if (name.length === 0 || name === 'NEXT_PUBLIC_') continue;
    names.add(name);
  }
  return names;
}

describe('the environment inventory', () => {
  const listed = new Set(SETTINGS.map((s) => s.name));

  it('names every variable the code actually reads', () => {
    const missing = [...readsInSource()].filter((name) => !listed.has(name)).sort();
    expect(missing, `add these to src/lib/config/environment.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not name variables nothing reads', () => {
    const reads = readsInSource();
    // Read by the deployment rather than by the code: the container sets it,
    // the platform sets it, or a person exports it before running a script.
    const setElsewhere = new Set(['AMRYN_ENABLE_EXTERNAL_RADAR']);
    const stale = SETTINGS.map((s) => s.name)
      .filter((name) => !reads.has(name) && !setElsewhere.has(name))
      .sort();
    expect(stale, `nothing reads these any more: ${stale.join(', ')}`).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(listed.size).toBe(SETTINGS.length);
  });

  it('says what each one is for, and what breaks without it', () => {
    for (const setting of SETTINGS) {
      expect(setting.purpose.length, setting.name).toBeGreaterThan(10);
      expect(setting.withoutIt.length, setting.name).toBeGreaterThan(5);
    }
  });
});

describe('.env.example', () => {
  const path = join(root, '.env.example');
  const example = existsSync(path) ? readFileSync(path, 'utf8') : '';

  it('exists', () => {
    expect(example.length).toBeGreaterThan(0);
  });

  it('mentions everything a deployment has to set for itself', () => {
    const missing = documented()
      .map((s) => s.name)
      .filter((name) => !example.includes(name))
      .sort();
    expect(missing, `add these to .env.example: ${missing.join(', ')}`).toEqual([]);
  });

  // The opposite failure: a variable a person is told to set that the platform
  // sets for them. Getting RAILWAY_PUBLIC_DOMAIN wrong by hand breaks every
  // link in every email the product sends.
  it('does not ask anybody to set what the host sets', () => {
    const wrongly = settingsFor('platform')
      .map((s) => s.name)
      // A commented-out mention is documentation, not an instruction. Only an
      // assignment at the start of a line asks somebody to fill it in.
      .filter((name) => new RegExp(`^${name}\\s*=`, 'm').test(example))
      .sort();
    expect(wrongly, `these are set by the host: ${wrongly.join(', ')}`).toEqual([]);
  });
});

describe('what a deployment cannot start without', () => {
  it('is a short list, and every entry says why', () => {
    const required = requiredSettings();
    expect(required.length).toBeGreaterThan(0);
    // Kept deliberately small. Anything that can degrade gracefully does, so
    // a first deployment reaches a working sign-in page before anybody has
    // decided about mail, payments or a model provider.
    expect(required.length).toBeLessThanOrEqual(4);
    for (const setting of required) {
      expect(setting.withoutIt.length, setting.name).toBeGreaterThan(5);
    }
  });

  // The one that catches people out, and the reason the Dockerfile takes
  // build arguments as well as environment variables.
  it('marks the browser-bundle settings as build-time', () => {
    for (const setting of SETTINGS) {
      if (setting.name.startsWith('NEXT_PUBLIC_')) {
        expect(setting.stage, setting.name).toBe('build');
      }
    }
  });

  it('marks every credential as secret', () => {
    for (const setting of SETTINGS) {
      // A NEXT_PUBLIC_ value is in the browser bundle by definition, so it
      // cannot be a secret whatever its name suggests — the anon key reads
      // like a credential and is published deliberately, because what it can
      // reach is decided by Row Level Security rather than by possession.
      if (setting.name.startsWith('NEXT_PUBLIC_')) {
        expect(setting.secret, setting.name).toBe(false);
        continue;
      }
      // Anchored, because AI_MAX_OUTPUT_TOKENS contains "TOKEN" and is a
      // number. A substring match here would demand that a ceiling on model
      // output be treated as a credential.
      if (/(_KEY|_PASSWORD|_TOKEN|_SECRET|DB_URL)$/.test(setting.name)) {
        expect(setting.secret, setting.name).toBe(true);
      }
    }
  });
});
