import 'server-only';
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing on Node's own scrypt.
 *
 * scrypt rather than a dependency because it is in the standard library, it is
 * memory-hard, and one fewer package in the supply chain of an authentication
 * path is worth more than a marginally nicer API.
 *
 * The cost parameters are stored inside the hash string, so raising them later
 * does not invalidate existing passwords: an old hash is still verifiable
 * against the parameters it was made with.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1, keyLength: 64 } as const;

/**
 * scrypt needs roughly 128 × N × r bytes and Node's default cap sits below that
 * at N = 2^15, so it throws rather than allocating unless maxmem is raised.
 */
function options(N: number, r: number, p: number): ScryptOptions {
  return { N, r, p, maxmem: 256 * N * r };
}

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  opts: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLength, opts, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(
    password,
    salt,
    PARAMS.keyLength,
    options(PARAMS.N, PARAMS.r, PARAMS.p),
  );

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Constant-time verification.
 *
 * Returns false for a malformed hash rather than throwing: a corrupt stored
 * value must read as "wrong password", never as a 500 that tells an attacker
 * the address exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  if (!nRaw || !rRaw || !pRaw || !saltRaw || !hashRaw) return false;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N <= 1 || r <= 0 || p <= 0) return false;

  const expected = Buffer.from(hashRaw, 'base64url');
  const salt = Buffer.from(saltRaw, 'base64url');
  if (expected.length === 0 || salt.length === 0) return false;

  try {
    const key = await derive(password, salt, expected.length, options(N, r, p));
    return timingSafeEqual(key, expected);
  } catch {
    // Parameters outside what this machine will allocate, most likely. A
    // failure to verify is a failure to sign in, not a crash.
    return false;
  }
}
