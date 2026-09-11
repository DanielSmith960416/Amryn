import { describe, expect, it } from 'vitest';

import { needsIdentity } from './middleware';

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
