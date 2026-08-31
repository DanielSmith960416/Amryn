import { describe, expect, it, vi } from 'vitest';

// `server-only` throws outside a server context; these are pure functions.
vi.mock('server-only', () => ({}));
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode,
} from './recovery-codes';

describe('generateRecoveryCodes', () => {
  it('issues ten distinct codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
  });

  it('never uses a character that can be misread', () => {
    // These come off a screen onto paper and back through a keyboard, often by
    // somebody already locked out. A code that fails on an ambiguous glyph is
    // indistinguishable from a wrong one.
    const codes = generateRecoveryCodes(50).join('');
    for (const character of '01258BILOSZ') {
      expect(codes).not.toContain(character);
    }
  });

  it('does not repeat itself across sets', () => {
    const a = new Set(generateRecoveryCodes(50));
    const b = generateRecoveryCodes(50);
    expect(b.filter((code) => a.has(code))).toEqual([]);
  });

  it('draws evenly across the alphabet, so the entropy is what it looks like', () => {
    // A modulo over random bytes biases the first few characters, which would
    // quietly cost bits. 25 symbols over 8000 draws: every one should appear.
    const drawn = generateRecoveryCodes(500).join('').replace(/-/g, '');
    const counts = new Map<string, number>();
    for (const character of drawn) counts.set(character, (counts.get(character) ?? 0) + 1);

    expect(counts.size).toBe(25);
    const expected = drawn.length / 25;
    for (const [character, count] of counts) {
      expect(count, `${character} appeared ${count} times, expected about ${expected}`).toBeGreaterThan(expected * 0.6);
      expect(count).toBeLessThan(expected * 1.4);
    }
  });
});

describe('hashRecoveryCode', () => {
  it('matches however the code was typed back', () => {
    // Off paper, months later, by somebody locked out. Punctuation and case
    // are not the test.
    const canonical = hashRecoveryCode('ACDE-F467-HJKM-NPQR');
    for (const variant of [
      'acde-f467-hjkm-npqr',
      'ACDEF467HJKMNPQR',
      '  ACDE F467 HJKM NPQR  ',
      'acde f467-hjkm npqr',
    ]) {
      expect(hashRecoveryCode(variant)).toBe(canonical);
    }
  });

  it('does not match a different code', () => {
    expect(hashRecoveryCode('ACDE-F467-HJKM-NPQR')).not.toBe(
      hashRecoveryCode('ACDE-F467-HJKM-NPQT'),
    );
  });

  it('produces a hash, not the code', () => {
    const hash = hashRecoveryCode('ACDE-F467-HJKM-NPQR');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('ACDE');
  });
});

describe('normaliseRecoveryCode', () => {
  it('strips everything that is not a code character', () => {
    expect(normaliseRecoveryCode(' acde-f467 ')).toBe('ACDEF467');
  });
});
