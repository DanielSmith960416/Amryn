import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard on the operator pages.
 *
 * These were public by design: diagnostics mostly explains why signing in does
 * not work, and a page needing a session is unreachable exactly then. Closing
 * them is right for a deployment with customers, and the escape hatch has to
 * survive the change or the original problem comes back.
 */
vi.mock('server-only', () => ({}));

const headerStore = { value: null as string | null };
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'x-internal-key' ? headerStore.value : null) }),
}));

const workspace = { value: null as { role: string } | null, throws: false };
vi.mock('@/lib/auth/session', () => ({
  getWorkspace: async () => {
    if (workspace.throws) throw new Error('database unreachable');
    return workspace.value;
  },
}));

const { internalAccess } = await import('./internal-access');

const TOKEN = 'a-long-internal-access-token-value';

beforeEach(() => {
  process.env.INTERNAL_ACCESS_TOKEN = TOKEN;
  headerStore.value = null;
  workspace.value = null;
  workspace.throws = false;
});

afterEach(() => {
  delete process.env.INTERNAL_ACCESS_TOKEN;
  vi.unstubAllEnvs();
});

describe('internalAccess', () => {
  it('refuses an anonymous visitor', async () => {
    await expect(internalAccess()).resolves.toBe('denied');
  });

  it('refuses an ordinary member', async () => {
    // A customer who signed up must never reach a page describing the system's
    // insides — and /setup runs schema changes.
    for (const role of ['viewer', 'analyst', 'branch_manager', 'executive']) {
      workspace.value = { role };
      await expect(internalAccess()).resolves.toBe('denied');
    }
  });

  it('admits an administrator', async () => {
    for (const role of ['org_admin', 'super_admin']) {
      workspace.value = { role };
      await expect(internalAccess()).resolves.toBe('administrator');
    }
  });

  it('admits the token by query string or header', async () => {
    await expect(internalAccess(TOKEN)).resolves.toBe('token');
    headerStore.value = TOKEN;
    await expect(internalAccess()).resolves.toBe('token');
  });

  it('refuses a wrong token, including one that is a prefix of the real one', async () => {
    await expect(internalAccess('wrong')).resolves.toBe('denied');
    await expect(internalAccess(TOKEN.slice(0, -1))).resolves.toBe('denied');
    await expect(internalAccess(TOKEN + 'x')).resolves.toBe('denied');
  });

  it('admits nobody by token when none is configured', async () => {
    // An escape hatch with no key must not become an escape hatch with a
    // guessable one.
    delete process.env.INTERNAL_ACCESS_TOKEN;
    await expect(internalAccess('')).resolves.toBe('denied');
    await expect(internalAccess(undefined)).resolves.toBe('denied');
    headerStore.value = '';
    await expect(internalAccess()).resolves.toBe('denied');
  });

  it('treats an empty configured token as no token', async () => {
    process.env.INTERNAL_ACCESS_TOKEN = '   ';
    await expect(internalAccess('   ')).resolves.toBe('denied');
  });

  it('still admits the token when the database is unreachable', async () => {
    // The circumstance these pages exist for. If a failure to answer "is this
    // an administrator" denied access, the page would be closed exactly when
    // it is needed.
    workspace.throws = true;
    await expect(internalAccess(TOKEN)).resolves.toBe('token');
    await expect(internalAccess()).resolves.toBe('denied');
  });

  it('admits the developer running next dev', async () => {
    // Otherwise the first local start says "a fault on our side, try again
    // shortly" and the terminal says nothing, so the one fact the developer
    // needs — which variable is missing — is the one fact withheld.
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.INTERNAL_ACCESS_TOKEN;
    await expect(internalAccess()).resolves.toBe('development');
  });

  it('admits nobody in production, whatever else is set', async () => {
    // The reason the check above is safe. `next build` and `next start` both
    // set production, so a deployment cannot reach the development branch.
    vi.stubEnv('NODE_ENV', 'production');
    await expect(internalAccess()).resolves.toBe('denied');
    await expect(internalAccess('wrong')).resolves.toBe('denied');
  });

  it('does not admit the test runner, which would void every case above', async () => {
    // Vitest sets NODE_ENV=test. If that counted as development, every
    // 'denied' assertion in this file would pass without testing anything.
    expect(process.env.NODE_ENV).toBe('test');
    await expect(internalAccess()).resolves.toBe('denied');
  });
});
