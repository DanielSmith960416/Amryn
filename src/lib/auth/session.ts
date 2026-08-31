import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Sessions as a signed cookie.
 *
 * No session table, no store round-trip on every request: the cookie carries
 * the account id and an expiry, HMAC-signed with a server secret. That is the
 * whole mechanism, and it is the right size for this product.
 *
 * What it buys: a page can identify its reader without touching the account
 * store. What it costs: a session cannot be revoked before it expires, other
 * than by rotating `AMRYN_SESSION_SECRET`, which signs everyone out. For a
 * fourteen-day executive session that is an acceptable trade; if per-session
 * revocation is ever needed, add a token id to the payload and a deny-list to
 * the store.
 */

export const SESSION_COOKIE = 'amryn_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export interface SessionPayload {
  /** Account id. */
  sub: string;
  /** Unix seconds. */
  exp: number;
}

class MissingSecretError extends Error {
  constructor() {
    super(
      'AMRYN_SESSION_SECRET is not set. Generate one with `openssl rand -base64 32` and add it ' +
        'to your environment before signing anyone in.',
    );
    this.name = 'MissingSecretError';
  }
}

/** The bar a configured secret has to clear, in characters. */
const MIN_SECRET_LENGTH = 16;

/**
 * Whether this deployment can actually sign anyone in.
 *
 * Without a secret, `startSession` throws — which surfaces as a 500 on the
 * sign-up form and tells the person filling it in nothing at all. The sign-up
 * page asks this first so a misconfigured deployment says so plainly, before
 * someone types a password into a form that cannot work.
 *
 * It reports whether a secret is set, never anything about its value.
 */
export function sessionSecretConfigured(): boolean {
  const configured = process.env.AMRYN_SESSION_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return true;
  // Outside production one is generated per process, so sessions do work.
  return process.env.NODE_ENV !== 'production';
}

/**
 * In development a missing secret is generated once per process, so the
 * platform runs out of the box. In production it is a hard error: a secret
 * that changes on every deploy would sign every client out on every deploy,
 * and one baked into the source would not be a secret.
 */
function secret(): string {
  const configured = process.env.AMRYN_SESSION_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;

  if (process.env.NODE_ENV === 'production') throw new MissingSecretError();

  const g = globalThis as { __amrynDevSecret?: string };
  g.__amrynDevSecret ??= randomBytes(32).toString('base64url');
  return g.__amrynDevSecret;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Returns null for anything that is not a valid, unexpired, correctly signed token. */
export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let provided: Buffer;
  let expected: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
    expected = Buffer.from(sign(body), 'base64url');
  } catch {
    return null;
  }
  // timingSafeEqual throws on a length mismatch, which is itself a signal, so
  // the lengths are compared first and the result is the same either way.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload?.sub !== 'string' || typeof payload?.exp !== 'number') return null;
  if (payload.exp * 1000 <= Date.now()) return null;

  return payload;
}

export async function startSession(accountId: string): Promise<void> {
  const token = encodeSession({
    sub: accountId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}
