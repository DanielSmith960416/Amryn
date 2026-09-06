/**
 * The manifest a backup writes and the migration runner checks.
 *
 * Shared so the two cannot drift. A fingerprint computed one way when the
 * backup is taken and another way when it is checked would either refuse every
 * valid backup or accept a backup of the wrong database, and the second is the
 * one that would go unnoticed until it mattered.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

/** How stale a backup may be and still count as "before this migration". */
export const MAX_AGE_HOURS = 24;

/**
 * Identifies a database without carrying its password.
 *
 * The manifest is a file somebody may keep, paste or attach, so it must not
 * contain the connection string. It still has to say which database the dump
 * came from — otherwise a backup of a scratch database would satisfy the guard
 * on the real one.
 */
export function databaseFingerprint(url) {
  try {
    const parsed = new URL(url);
    // The socket form puts the host in a parameter rather than the authority.
    const host = parsed.searchParams.get('host') ?? parsed.hostname;
    const name = parsed.pathname.replace(/^\//, '') || 'postgres';
    return {
      label: `${host}/${name}`,
      digest: createHash('sha256').update(`${host}/${name}`).digest('hex').slice(0, 16),
    };
  } catch {
    // Not every valid connection string is a valid WHATWG URL — the unix
    // socket form, `postgresql://user@/db?host=/var/run`, is rejected outright.
    //
    // Falling back to hashing the whole string would be worse than useless: it
    // would fold the password into the fingerprint, so rotating the password
    // would invalidate every backup ever taken and the guard would refuse a
    // perfectly good one with a message about the wrong database. Credentials
    // come out first.
    const withoutCredentials = url.replace(/\/\/[^/@]*@/, '//');
    const host = /[?&]host=([^&]+)/.exec(withoutCredentials)?.[1] ?? '';
    const name = /\/\/[^/?]*\/([^?]+)/.exec(withoutCredentials)?.[1] ?? 'postgres';
    const label = `${decodeURIComponent(host)}/${name}`;
    return {
      label,
      digest: createHash('sha256').update(label).digest('hex').slice(0, 16),
    };
  }
}

/**
 * Every reason this manifest does not stand as a backup of `url` taken just
 * now. Empty means it does.
 *
 * Returns all the reasons rather than the first, because a manifest that is
 * both stale and from another database should say so once.
 */
export function manifestProblems(path, url, now = new Date()) {
  if (!path) return ['no manifest was given'];
  if (!existsSync(path)) return [`${path} does not exist`];

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return [`${path} is not readable as a manifest: ${error.message}`];
  }

  const problems = [];
  const expected = databaseFingerprint(url);

  if (manifest.database !== expected.digest) {
    problems.push(
      `it is a backup of ${manifest.databaseLabel ?? 'another database'}, not ${expected.label}`,
    );
  }

  const takenAt = new Date(manifest.takenAt ?? 0);
  const ageHours = (now.getTime() - takenAt.getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) {
    problems.push('its timestamp is not a time in the past');
  } else if (ageHours > MAX_AGE_HOURS) {
    problems.push(`it was taken ${Math.round(ageHours)} hours ago, more than ${MAX_AGE_HOURS}`);
  }

  // The manifest is a claim about a file. Checking the file is what turns it
  // into a fact — a dump deleted to free space leaves its manifest behind, and
  // a manifest alone restores nothing.
  if (!manifest.dump || !existsSync(manifest.dump)) {
    problems.push(`the dump it names (${manifest.dump ?? 'none'}) is not there`);
  } else {
    const bytes = statSync(manifest.dump).size;
    if (bytes !== manifest.bytes) {
      problems.push(`the dump is ${bytes} bytes, not the ${manifest.bytes} recorded`);
    } else {
      const sha256 = createHash('sha256').update(readFileSync(manifest.dump, 'utf8')).digest('hex');
      if (sha256 !== manifest.sha256) problems.push('the dump does not match its recorded checksum');
    }
  }

  return problems.length > 0 ? problems : [];
}

export function readManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
