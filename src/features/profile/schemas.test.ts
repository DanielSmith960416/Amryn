import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  dateOfBirthSchema,
  nameSchema,
  passwordStrength,
} from './schemas';

describe('nameSchema', () => {
  it('keeps a first and last name', () => {
    const parsed = nameSchema.parse({ firstName: ' Daniel ', lastName: ' Smith ' });
    expect(parsed).toEqual({ firstName: 'Daniel', lastName: 'Smith' });
  });

  /*
   * The profile migration 46 backfilled from already means this: "Alzan" has a
   * first name and nothing after it. Requiring a surname would make that
   * profile impossible to save until its owner invented one.
   */
  it('accepts one name as a whole name', () => {
    expect(nameSchema.parse({ firstName: 'Alzan', lastName: '' })).toEqual({
      firstName: 'Alzan',
      lastName: null,
    });
    expect(nameSchema.parse({ firstName: 'Alzan' })).toEqual({
      firstName: 'Alzan',
      lastName: null,
    });
  });

  it('refuses an empty first name, which is what the greeting reads', () => {
    expect(nameSchema.safeParse({ firstName: '   ', lastName: 'Smith' }).success).toBe(false);
  });
});

describe('dateOfBirthSchema', () => {
  it('takes a date', () => {
    expect(dateOfBirthSchema.parse({ dateOfBirth: '1984-04-16' }).dateOfBirth).toBe('1984-04-16');
  });

  /*
   * Withdrawing it has to be as easy as giving it — an empty field is the
   * clear, and clearing is not an error.
   */
  it('takes an empty value, which is how a date is withdrawn', () => {
    expect(dateOfBirthSchema.safeParse({ dateOfBirth: '' }).success).toBe(true);
  });

  it('refuses a date in the future and one before records', () => {
    const nextYear = `${new Date().getUTCFullYear() + 1}-01-01`;
    expect(dateOfBirthSchema.safeParse({ dateOfBirth: nextYear }).success).toBe(false);
    expect(dateOfBirthSchema.safeParse({ dateOfBirth: '1823-05-01' }).success).toBe(false);
  });

  it('refuses something that is not a date at all', () => {
    for (const value of ['16/04/1984', '1984-13-01', 'yesterday']) {
      expect(dateOfBirthSchema.safeParse({ dateOfBirth: value }).success, value).toBe(false);
    }
  });
});

describe('changePasswordSchema', () => {
  const good = { current: 'old-password-1', password: 'a-new-long-one', confirm: 'a-new-long-one' };

  it('accepts a change', () => {
    expect(changePasswordSchema.safeParse(good).success).toBe(true);
  });

  it('insists on the current one, so an open session cannot take the account', () => {
    expect(changePasswordSchema.safeParse({ ...good, current: '' }).success).toBe(false);
  });

  it('refuses a mistyped confirmation', () => {
    expect(
      changePasswordSchema.safeParse({ ...good, confirm: 'a-new-long-onf' }).success,
    ).toBe(false);
  });

  it('refuses the password already in use', () => {
    const same = { current: 'the-same-one', password: 'the-same-one', confirm: 'the-same-one' };
    expect(changePasswordSchema.safeParse(same).success).toBe(false);
  });
});

describe('passwordStrength', () => {
  it('calls anything under the minimum weak', () => {
    expect(passwordStrength('short')).toBe('weak');
    expect(passwordStrength('')).toBe('weak');
  });

  it('rates length above variety, because length is what actually costs', () => {
    expect(passwordStrength('correct horse battery staple')).toBe('strong');
    // Four classes in eight characters is the shape a rule-based meter loves
    // and an attacker does not mind.
    expect(passwordStrength('Aa1!Aa1!')).not.toBe('strong');
  });

  it('marks down a repeated run', () => {
    expect(passwordStrength('aaaaaaaaaaaa')).toBe('weak');
  });

  it('marks down a walk along the keyboard or the alphabet', () => {
    expect(passwordStrength('abcdefghijkl')).toBe('weak');
    expect(passwordStrength('123456789012')).toBe('weak');
  });

  it('is a meter and not a gate: a fair password is still a password', () => {
    expect(['fair', 'strong']).toContain(passwordStrength('kimberley99'));
  });
});
