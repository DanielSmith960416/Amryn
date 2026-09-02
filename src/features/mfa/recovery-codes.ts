import 'server-only';
import { createHash, randomInt } from 'node:crypto';

/**
 * Recovery codes.
 *
 * The failure mode of two-factor authentication is not an attacker; it is a
 * lost phone. Without a way back, turning it on is a way to lose an account —
 * and the people most likely to turn it on are the ones with the most to lose.
 *
 * Ten codes, each usable once, hashed before storage for the same reason a
 * password is: a database that can produce the codes is a database that can
 * bypass the factor.
 */

/** How many are issued at a time. Enough to lose a few and not run out. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * The alphabet, minus the characters people misread.
 *
 * No 0/O, 1/I/L, 2/Z, 5/S, 8/B. These get copied off a screen onto paper and
 * typed back months later, often by somebody already locked out and
 * frustrated, and a code that fails because of an ambiguous glyph is
 * indistinguishable from a code that is wrong.
 */
const ALPHABET = '34679ACDEFGHJKMNPQRTUVWXY';

/** Four groups of four, hyphenated: 20 bits per group, ~93 bits per code. */
function oneCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g += 1) {
    let group = '';
    // randomInt draws from the same source as randomBytes and is not subject
    // to the modulo bias that `bytes[i] % ALPHABET.length` would introduce.
    for (let c = 0; c < 4; c += 1) group += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(group);
  }
  return groups.join('-');
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  // A collision within one set would mean two rows with the same hash, which
  // the unique constraint refuses — and the loop is cheaper than the failure.
  while (codes.size < count) codes.add(oneCode());
  return [...codes];
}

/**
 * The stored form.
 *
 * Normalised first, so that a code typed in lower case, with spaces, or with
 * the hyphens left out still matches the one that was issued. Somebody
 * reading a code off paper should not be defeated by punctuation.
 *
 * Plain SHA-256 rather than a slow hash: unlike a password these are 93 bits
 * of uniform randomness, so there is no dictionary to run and nothing for a
 * work factor to buy.
 */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normaliseRecoveryCode(code)).digest('hex');
}

export function normaliseRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
