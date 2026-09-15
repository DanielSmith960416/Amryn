import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from './next-path';

/**
 * Sign-in now honours ?next=, so that following an invitation link survives
 * signing in. That parameter decides where a freshly authenticated person is
 * sent, which makes it the classic open-redirect surface: a link on a domain
 * they trust that lands somewhere they do not.
 */
describe('safeNextPath', () => {
  it('keeps a path on this site', () => {
    expect(safeNextPath('/invite/abc123')).toBe('/invite/abc123');
    expect(safeNextPath('/settings/users')).toBe('/settings/users');
  });

  it('refuses an absolute URL', () => {
    expect(safeNextPath('https://evil.example/login')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('http://evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses a protocol-relative URL, which reads like a path and is not', () => {
    // Browsers resolve //evil.example against the current scheme, so this
    // leaves the site while looking local.
    expect(safeNextPath('//evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('//evil.example/invite/abc')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses a backslash escape, which some browsers treat as a slash', () => {
    expect(safeNextPath('/\\evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses anything that is not a path at all', () => {
    for (const value of ['javascript:alert(1)', 'evil.example', '', '   ', 'mailto:a@b.c']) {
      expect(safeNextPath(value)).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it('refuses a value that is not a string, since form data need not be one', () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath(42)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath({ toString: () => '/evil' })).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  /*
   * The loop this function let run for two days.
   *
   * "/command-centre, /command-centre" is what a browser asks for when one
   * response carried two Location headers — HTTP joins repeated headers with
   * a comma and a space. It 404s, and asking for it without a session put it
   * into ?next=, which put it into the sign-in form, which sent the reader
   * back to it. Origin was never the problem: it is on this origin. It is
   * simply not a path.
   */
  it('refuses a target no route could match, which is what kept the loop alive', () => {
    expect(safeNextPath('/command-centre, /command-centre')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('/command-centre,%20/command-centre')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('/two words')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('/a\nb')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('/a\tb')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses an escape that hides an off-origin target from the checks above', () => {
    // %2F%2Fevil.example reads as a single-slash path and resolves as two.
    expect(safeNextPath('/%2F%2Fevil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('/%5Cevil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath('/%')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('still keeps the real targets, which is the whole point of honouring next', () => {
    expect(safeNextPath('/invite/abc123')).toBe('/invite/abc123');
    expect(safeNextPath('/command-centre?activated=1')).toBe('/command-centre?activated=1');
    expect(safeNextPath('/data/integrations/paystack')).toBe('/data/integrations/paystack');
    expect(safeNextPath('/imprint/what-we-sell')).toBe('/imprint/what-we-sell');
  });

  it('lands somewhere useful by default rather than nowhere', () => {
    expect(DEFAULT_AFTER_SIGN_IN.startsWith('/')).toBe(true);
  });
});
