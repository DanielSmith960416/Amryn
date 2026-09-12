import { describe, expect, it } from 'vitest';

import { decodeAal, verifiedTotpFactor } from './aal';

/** A token with the given payload. Unsigned — nothing here checks a signature. */
function token(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${body}.signature`;
}

describe('decodeAal', () => {
  it('reads the level a session presented', () => {
    expect(decodeAal(token({ aal: 'aal1' }))).toBe('aal1');
    expect(decodeAal(token({ aal: 'aal2' }))).toBe('aal2');
  });

  it('says nothing where the claim is absent', () => {
    expect(decodeAal(token({ sub: 'abc' }))).toBeUndefined();
  });

  /*
   * A malformed token is not an exception to throw. This decides a redirect,
   * and the database refuses a session that owes a factor regardless — so the
   * safe answer to "I cannot read this" is to not redirect.
   */
  it('returns nothing rather than throwing on rubbish', () => {
    for (const bad of ['', 'not-a-token', 'a.b', 'a.!!!.c', null, undefined]) {
      expect(decodeAal(bad as string)).toBeUndefined();
    }
  });

  it('handles base64url padding, which is what Supabase issues', () => {
    expect(decodeAal(token({ aal: 'aal2', amr: [{ method: 'totp' }] }))).toBe('aal2');
  });
});

describe('verifiedTotpFactor', () => {
  it('finds the factor to challenge', () => {
    const factor = verifiedTotpFactor([
      { id: 'f1', status: 'unverified', factor_type: 'totp' },
      { id: 'f2', status: 'verified', factor_type: 'totp' },
    ]);
    expect(factor?.id).toBe('f2');
  });

  it('ignores one that was never verified', () => {
    expect(
      verifiedTotpFactor([{ id: 'f1', status: 'unverified', factor_type: 'totp' }]),
    ).toBeUndefined();
  });

  it('ignores a factor of another kind', () => {
    expect(
      verifiedTotpFactor([{ id: 'f1', status: 'verified', factor_type: 'phone' }]),
    ).toBeUndefined();
  });

  /*
   * Supabase has not always sent factor_type. Treating its absence as TOTP
   * keeps an enrolled account challenged rather than quietly waved through,
   * which is the direction to err in.
   */
  it('treats a factor with no stated kind as the one we issue', () => {
    expect(verifiedTotpFactor([{ id: 'f1', status: 'verified' }])?.id).toBe('f1');
  });

  it('is quiet about no factors at all', () => {
    expect(verifiedTotpFactor([])).toBeUndefined();
    expect(verifiedTotpFactor(null)).toBeUndefined();
    expect(verifiedTotpFactor(undefined)).toBeUndefined();
  });
});
