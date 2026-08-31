import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The auth modules import `server-only`, which throws outside a server
 * component, and `session.ts` needs a secret. Both are set up before the
 * modules load.
 */
beforeAll(() => {
  process.env.AMRYN_SESSION_SECRET = 'test-secret-at-least-sixteen-characters';
});

// Any test that stubs the environment puts it back, so the ones after it still
// see a configured secret.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const { hashPassword, verifyPassword } = await import('./password');

    const hash = await hashPassword('a reasonable passphrase');
    expect(await verifyPassword('a reasonable passphrase', hash)).toBe(true);
    expect(await verifyPassword('a reasonable passphras', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const { hashPassword, verifyPassword } = await import('./password');

    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('records its parameters in the hash so they can be raised later', async () => {
    const { hashPassword } = await import('./password');
    const hash = await hashPassword('x'.repeat(12));
    const [algorithm, N, r, p] = hash.split('$');

    expect(algorithm).toBe('scrypt');
    expect(Number(N)).toBeGreaterThan(1);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    const { verifyPassword } = await import('./password');

    // A corrupt stored value must read as "wrong password", never as a 500
    // that confirms the address exists.
    for (const bad of ['', 'nonsense', 'scrypt$x$y$z$q$r', 'bcrypt$1$2$3$4$5', '$$$$$']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });

  it('normalises unicode so the same typed password verifies either way', async () => {
    const { hashPassword, verifyPassword } = await import('./password');

    const composed = 'café passphrase!'; // é as one code point
    const decomposed = 'café passphrase!'; // e + combining acute
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });
});

describe('session tokens', () => {
  it('round-trips a payload', async () => {
    const { encodeSession, decodeSession } = await import('./session');

    const exp = Math.floor(Date.now() / 1000) + 3600;
    const decoded = decodeSession(encodeSession({ sub: 'account-1', exp }));
    expect(decoded).toEqual({ sub: 'account-1', exp });
  });

  it('rejects a tampered payload', async () => {
    const { encodeSession, decodeSession } = await import('./session');

    const token = encodeSession({ sub: 'account-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const forged = Buffer.from(
      JSON.stringify({ sub: 'someone-else', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');

    // Swapping the body while keeping a valid-looking signature must fail.
    expect(decodeSession(`${forged}.${token.split('.')[1]}`)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { encodeSession, decodeSession } = await import('./session');
    expect(decodeSession(encodeSession({ sub: 'a', exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
  });

  it('rejects malformed input without throwing', async () => {
    const { decodeSession } = await import('./session');
    for (const bad of [undefined, '', 'no-dot', '.', 'a.', '.b', 'not.base64url!!']) {
      expect(decodeSession(bad)).toBeNull();
    }
  });
});

describe('sessionSecretConfigured', () => {
  it('is true when a long enough secret is set', async () => {
    const { sessionSecretConfigured } = await import('./session');
    expect(sessionSecretConfigured()).toBe(true);
  });

  it('is false in production when the secret is missing or too short', async () => {
    const { sessionSecretConfigured } = await import('./session');

    // stubEnv rather than assigning process.env directly: NODE_ENV is a
    // non-configurable property there, and vitest restores it for us.
    vi.stubEnv('NODE_ENV', 'production');

    vi.stubEnv('AMRYN_SESSION_SECRET', '');
    expect(sessionSecretConfigured()).toBe(false);

    // A short secret is a misconfiguration, not a secret.
    vi.stubEnv('AMRYN_SESSION_SECRET', 'too-short');
    expect(sessionSecretConfigured()).toBe(false);
  });

  it('is true outside production even with no secret, since one is generated', async () => {
    const { sessionSecretConfigured } = await import('./session');
    vi.stubEnv('AMRYN_SESSION_SECRET', '');
    expect(sessionSecretConfigured()).toBe(true);
  });
});

describe('account store', () => {
  it('treats email as case-insensitive and refuses a duplicate', async () => {
    const { accountStore, EmailTakenError } = await import('./store');
    const store = accountStore();

    const account = {
      id: 'acct-1',
      email: 'Owner@Example.COM',
      passwordHash: 'scrypt$1$2$3$4$5',
      fullName: 'Test Owner',
      companyName: 'Test Business',
      createdAt: new Date().toISOString(),
    };

    await store.create(account);

    expect((await store.findByEmail('owner@example.com'))?.id).toBe('acct-1');
    expect((await store.findByEmail('OWNER@EXAMPLE.COM'))?.id).toBe('acct-1');
    expect((await store.findById('acct-1'))?.email).toBe('owner@example.com');

    await expect(store.create({ ...account, id: 'acct-2' })).rejects.toBeInstanceOf(
      EmailTakenError,
    );
  });

  it('returns null for an address nobody has registered', async () => {
    const { accountStore } = await import('./store');
    expect(await accountStore().findByEmail('nobody@example.com')).toBeNull();
    expect(await accountStore().findById('no-such-id')).toBeNull();
  });
});
