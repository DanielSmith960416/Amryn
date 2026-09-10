import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nangoProvider } from './nango-client';
import { ProviderError } from './provider';
import { connector } from './catalogue';

/**
 * The adapter is the one file that talks to somebody else's API, so these pin
 * the two things that would be discovered by a customer rather than by us: a
 * secret reaching somewhere it should not, and an unverified webhook being
 * trusted.
 *
 * fetch() is stubbed rather than called. Exercising the real API would need a
 * live key, would create real connections, and would fail in CI — and what is
 * being tested here is Amryn's half of the conversation.
 */

const definition = connector('xero')!;
const subject = { organisationId: 'org-1', userId: 'user-1', userEmail: 'a@example.invalid' };

let calls: Array<{ url: string; init: RequestInit }>;

/** The request under inspection. Throws rather than returning undefined, so a
 *  test that expected a call and got none fails on that fact. */
function firstCall(): { url: string; init: RequestInit } {
  const call = calls[0];
  if (!call) throw new Error('no request was made');
  return call;
}

function respond(body: unknown, status = 200) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

beforeEach(() => {
  calls = [];
  process.env.NANGO_SECRET_KEY = 'test-secret-value';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NANGO_SECRET_KEY;
});

describe('invite', () => {
  it('asks for a session and returns the link to send the customer to', async () => {
    vi.stubGlobal('fetch', respond({ data: { connect_link: 'https://connect.invalid/abc' } }));

    const invitation = await nangoProvider('xero', 'xero-prod').invite(definition, subject);

    expect(invitation.url).toBe('https://connect.invalid/abc');
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(firstCall().url).toBe('https://api.nango.dev/connect/sessions');
  });

  it('sends the organisation out, because the provider does not model ownership', async () => {
    // Nango's own guide: "Nango doesn't model that ownership." These tags are
    // the only thing that will tie the webhook back to a row in
    // data_connections — without them a completed authorisation is an orphan.
    vi.stubGlobal('fetch', respond({ data: { connect_link: 'https://connect.invalid/abc' } }));

    await nangoProvider('xero', 'xero-prod').invite(definition, subject);

    const body = JSON.parse(String(firstCall().init.body));
    expect(body.tags.organization_id).toBe('org-1');
    expect(body.tags.end_user_id).toBe('user-1');
    expect(body.allowed_integrations).toEqual(['xero-prod']);
  });

  it('names the integration Nango knows, not the one Amryn does', async () => {
    // Assuming the two are equal works until somebody renames one of them.
    vi.stubGlobal('fetch', respond({ data: { connect_link: 'https://connect.invalid/abc' } }));

    await nangoProvider('xero', 'a-different-name').invite(definition, subject);

    expect(JSON.parse(String(firstCall().init.body)).allowed_integrations).toEqual(['a-different-name']);
  });

  it('refuses when a link does not come back rather than returning an empty URL', async () => {
    vi.stubGlobal('fetch', respond({ data: {} }));
    await expect(nangoProvider('xero', 'xero-prod').invite(definition, subject)).rejects.toThrow(
      ProviderError,
    );
  });
});

describe('adopt', () => {
  it('confirms the connection exists before Amryn writes it down', async () => {
    // A webhook is a claim made by something outside the application. Writing
    // an unverified connection ID into data_connections would let a forged
    // notification attach somebody else's connection to a customer.
    vi.stubGlobal('fetch', respond({ end_user: { email: 'finance@example.invalid' } }));

    const established = await nangoProvider('xero', 'xero-prod').adopt(definition, 'conn-9');

    expect(firstCall().url).toContain('/connections/conn-9');
    expect(firstCall().url).toContain('provider_config_key=xero-prod');
    expect(established.credentialRef).toBe('conn-9');
    expect(established.accountLabel).toBe('finance@example.invalid');
  });

  it('escapes the reference, because it arrives from outside', async () => {
    vi.stubGlobal('fetch', respond({}));
    await nangoProvider('xero', 'xero-prod').adopt(definition, 'a/../b?x=1');
    expect(firstCall().url).not.toContain('a/../b');
  });

  it('refuses a connection the provider does not recognise', async () => {
    vi.stubGlobal('fetch', respond({ error: 'unknown' }, 404));
    await expect(nangoProvider('xero', 'xero-prod').adopt(definition, 'nope')).rejects.toThrow(
      ProviderError,
    );
  });
});

describe('errors', () => {
  it('never puts the secret in a message shown to a customer', async () => {
    vi.stubGlobal('fetch', respond({ message: 'bad key test-secret-value' }, 401));

    await expect(nangoProvider('xero', 'xero-prod').adopt(definition, 'c')).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('test-secret-value'),
      }),
    );
  });

  it('sends the secret as a bearer token and nowhere else', async () => {
    vi.stubGlobal('fetch', respond({ data: { connect_link: 'https://connect.invalid/a' } }));

    await nangoProvider('xero', 'xero-prod').invite(definition, subject);

    const headers = firstCall().init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-secret-value');
    expect(String(firstCall().url)).not.toContain('test-secret-value');
    expect(String(firstCall().init.body)).not.toContain('test-secret-value');
  });

  it('marks their faults retryable and ours not', async () => {
    // An application that retries its own bad request against a rate-limited
    // API turns one fault into two.
    vi.stubGlobal('fetch', respond({}, 503));
    await expect(nangoProvider('xero', 'x').adopt(definition, 'c')).rejects.toMatchObject({
      retryable: true,
    });

    vi.stubGlobal('fetch', respond({}, 400));
    await expect(nangoProvider('xero', 'x').adopt(definition, 'c')).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('says the deployment is unconfigured rather than sending an empty bearer token', async () => {
    delete process.env.NANGO_SECRET_KEY;
    vi.stubGlobal('fetch', respond({}));

    await expect(nangoProvider('xero', 'x').invite(definition, subject)).rejects.toThrow(
      /not configured/i,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('what is deliberately not built', () => {
  it('refuses to sync, rather than inventing a proxy path', async () => {
    // The auth half above is written from documented calls. A fabricated
    // endpoint sitting beside four real ones is worse than an honest gap.
    await expect(
      nangoProvider('xero', 'x').fetch({ credentialRef: 'c', kind: 'invoices', cursor: null, since: null }),
    ).rejects.toThrow(/not built yet/i);
  });

  it('does not claim to have revoked a credential it has not', async () => {
    // The dangerous one: a wrong path here fails silently and leaves a
    // customer believing access was withdrawn when it was not.
    await expect(nangoProvider('xero', 'x').revoke('c')).rejects.toThrow(/at the provider/i);
  });
});
