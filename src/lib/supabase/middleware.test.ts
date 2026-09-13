import { describe, expect, it } from 'vitest';

import { bounceSignedIn, needsIdentity } from './middleware';
import { config } from '@/middleware';

/*
 * One round trip to the auth server, per request, decided here.
 *
 * The middleware used to ask who was asking on every request the matcher
 * admitted — including pages that cannot branch on the answer. These are the
 * paths where the answer is worth paying for and the ones where it is not.
 */
describe('needsIdentity', () => {
  it('asks on a private route, because that is the route being guarded', () => {
    expect(needsIdentity('/command-centre')).toBe(true);
    expect(needsIdentity('/data/integrations/paystack')).toBe(true);
    expect(needsIdentity('/')).toBe(true);
  });

  /*
   * Both redirect a caller who is already signed in, so they are the two
   * public paths that genuinely need the answer.
   */
  it('asks on sign-in and sign-up, which redirect a signed-in caller', () => {
    expect(needsIdentity('/sign-in')).toBe(true);
    expect(needsIdentity('/sign-up')).toBe(true);
  });

  it('does not ask where nothing can branch on it', () => {
    for (const path of [
      '/legal/privacy',
      '/diagnostics',
      '/invite/abc123',
      '/forgot-password',
      '/reset-password',
      '/auth/callback',
      '/api/health',
      '/setup',
    ]) {
      expect(needsIdentity(path), path).toBe(false);
    }
  });

  /*
   * The prefix match is on a path segment, not on characters. Without that,
   * a private route whose name merely starts with a public one — /legalese,
   * /setup-wizard — would be treated as public and skip the check.
   */
  it('matches whole segments, so a private route is not caught by a prefix', () => {
    expect(needsIdentity('/legalese')).toBe(true);
    expect(needsIdentity('/setup-wizard')).toBe(true);
    expect(needsIdentity('/diagnostics-report')).toBe(true);
  });
});

/*
 * What the middleware is asked to look at in the first place.
 *
 * needsIdentity above decides whether an admitted request costs a round trip.
 * This decides whether a request is admitted at all, and it is the check that
 * catches a file fetched by something that cannot sign in: robots.txt was
 * found redirecting to /sign-in by fetching it, and manifest.webmanifest was
 * found the same way — a launcher asking for the app's name and icon got an
 * HTML redirect, so the phone guessed from the page's meta tags instead and
 * drew a launch screen of its own.
 */
describe('the matcher', () => {
  // Built from the same string the middleware exports, so this cannot pass
  // against a pattern the middleware does not actually use.
  const pattern = new RegExp(`^${matcherPattern()}$`);

  function matcherPattern(): string {
    const [only] = config.matcher;
    if (!only) throw new Error('the middleware declares no matcher');
    return only;
  }

  it('admits the pages that need guarding', () => {
    for (const path of ['/', '/command-centre', '/assistant', '/sign-in', '/settings/security']) {
      expect(pattern.test(path), path).toBe(true);
    }
  });

  it('leaves out what a stranger fetches without a session', () => {
    for (const path of [
      '/robots.txt',
      '/sitemap.xml',
      '/manifest.webmanifest',
      '/favicon.ico',
      '/brand/amryn-app-icon-512.png',
      '/api/health/live',
    ]) {
      expect(pattern.test(path), path).toBe(false);
    }
  });
});

/*
 * The convenience that broke signing in.
 *
 * Somebody already signed in has no use for the sign-in form, so a GET of it
 * sends them to the Command Centre instead. That bounce used to run on every
 * method — including the POST that *is* the sign-in. Middleware redirected it,
 * the server action redirected it too, and two Location headers on one
 * response are joined with a comma: the browser was sent to
 * "/command-centre, /command-centre" and got a 404, after a correct password,
 * which reads as the application failing rather than as a redirect problem.
 *
 * Any browser holding a stale-but-valid cookie hit it — a previous failed
 * attempt that still minted a session, or a second tab.
 */
describe('bounceSignedIn', () => {
  it('sends a signed-in caller who navigates to the way-in pages onward', () => {
    expect(bounceSignedIn('GET', '/sign-in', true)).toBe(true);
    expect(bounceSignedIn('GET', '/sign-up', true)).toBe(true);
    expect(bounceSignedIn('HEAD', '/sign-in', true)).toBe(true);
  });

  it('leaves the sign-in submission alone, whoever is asking', () => {
    // The POST is the attempt itself. The action answers it with its own
    // redirect, and a second one from here is what produced the merged header.
    expect(bounceSignedIn('POST', '/sign-in', true)).toBe(false);
    expect(bounceSignedIn('POST', '/sign-up', true)).toBe(false);
  });

  it('does not bounce a stranger, who is on those pages to sign in', () => {
    expect(bounceSignedIn('GET', '/sign-in', false)).toBe(false);
    expect(bounceSignedIn('GET', '/sign-up', false)).toBe(false);
  });

  it('is only about the two way-in pages', () => {
    expect(bounceSignedIn('GET', '/command-centre', true)).toBe(false);
    expect(bounceSignedIn('GET', '/forgot-password', true)).toBe(false);
    expect(bounceSignedIn('GET', '/sign-in/extra', true)).toBe(false);
  });
});
