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

  it('lands somewhere useful by default rather than nowhere', () => {
    expect(DEFAULT_AFTER_SIGN_IN.startsWith('/')).toBe(true);
  });
});
