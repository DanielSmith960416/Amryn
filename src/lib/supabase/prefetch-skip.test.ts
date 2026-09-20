import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * That a prefetch does not reach the auth server.
 *
 * isPrefetch() is tested beside the other middleware helpers, and testing it
 * proves only that the headers are read correctly. It does not prove the thing
 * the change exists for: that updateSession actually stops before calling
 * getUser(). A refactor could keep the helper perfect and move the early
 * return below the call, and every header test would still pass while the
 * twelve round trips came back.
 *
 * So this counts the calls.
 */

const getUser = vi.fn(async () => ({ data: { user: { id: 'u1', factors: [] } } }));
const getSession = vi.fn(async () => ({ data: { session: null } }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser, getSession } })),
}));

vi.mock('@/lib/env', () => ({
  isSupabaseConfigured: () => true,
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  }),
}));

const { updateSession } = await import('./middleware');
const { NextRequest } = await import('next/server');

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(`https://amryn.test${path}`), { headers: new Headers(headers) });
}

beforeEach(() => {
  getUser.mockClear();
  getSession.mockClear();
});

describe('what a prefetch costs', () => {
  it('asks the auth server on a real navigation to a private page', async () => {
    await updateSession(request('/command-centre'));
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  /*
   * The whole point. Twelve of the thirteen calls on one page load were these.
   */
  it('asks nothing at all on a prefetch of the same page', async () => {
    await updateSession(request('/command-centre', { 'Next-Router-Prefetch': '1' }));
    expect(getUser).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('asks nothing on a browser’s own speculative load either', async () => {
    await updateSession(request('/command-centre', { 'Sec-Purpose': 'prefetch;prerender' }));
    expect(getUser).not.toHaveBeenCalled();
  });

  /*
   * A prefetch is let through rather than redirected. Redirecting it would
   * poison the router cache with a redirect for a page the caller can see, and
   * the page's own requireWorkspace() is what actually guards it.
   */
  it('lets the prefetch through rather than redirecting it', async () => {
    const response = await updateSession(request('/command-centre', { Purpose: 'prefetch' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  /*
   * The half that would be a security fault rather than a slow page: a real
   * navigation by a signed-out caller must still be stopped here.
   */
  it('still redirects a signed-out caller who is actually arriving', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } } as never);
    const response = await updateSession(request('/command-centre'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/sign-in');
  });

  /*
   * And the reason skipping the prefetch is safe rather than merely cheap: a
   * signed-out prefetch is admitted, but admitted to a page that redirects on
   * its own and to a database that refuses it either way. What must not happen
   * is the prefetch being treated as a *session* — the auth server is never
   * asked, so nothing is refreshed and no cookie is written.
   */
  it('writes no session cookie on a prefetch', async () => {
    const response = await updateSession(request('/command-centre', { 'Next-Router-Prefetch': '1' }));
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
