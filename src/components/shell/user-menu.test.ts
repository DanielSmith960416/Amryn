import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * That the way out actually ends the session.
 *
 * A source guard rather than a rendered test, because the failure it exists to
 * catch is not a rendering failure. The menu had a sign-out icon, the words
 * "Forget this device", and an onClick that cleared a localStorage key and
 * pushed the router at `/`. Every part of it looked right. The session was
 * never touched, so `/` redirected back to the Command Centre and the
 * middleware bounced anybody who tried to reach /sign-in — you could not sign
 * out, and you could not sign back in.
 *
 * `signOut` had been sitting in features/auth/actions.ts since the shell was
 * built, complete and correct and called by nothing. Rendering the component
 * and clicking the button would not have caught that; reading what the button
 * is wired to does.
 */
const source = readFileSync(join(__dirname, 'user-menu.tsx'), 'utf8');

describe('the user menu', () => {
  it('submits to the sign-out action', () => {
    expect(source).toMatch(/import \{ signOut \} from '@\/features\/auth\/actions'/);
    expect(source).toMatch(/<form action=\{signOut\}/);
  });

  it('offers exactly one way out, so there is no second one left unwired', () => {
    const buttons = source.match(/type="submit"/g) ?? [];
    expect(buttons).toHaveLength(1);
  });

  it('does not try to leave by navigating instead', () => {
    // router.push('/') was the whole of the old sign-out, and `/` redirects
    // to the Command Centre — so it returned the reader to where they started
    // while still signed in.
    expect(source).not.toContain('useRouter');
    expect(source).not.toContain("push('/')");
  });

  it('still clears the remembered name, which belongs to whoever just left', () => {
    expect(source).toContain('clearProfile()');
  });
});
