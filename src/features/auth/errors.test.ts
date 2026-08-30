import { describe, expect, it } from 'vitest';
import { INVALID_CREDENTIALS, classifyAuthError, signInErrorMessage } from './errors';

describe('classifyAuthError', () => {
  it('calls a rejected API key a configuration fault, not the reader’s', () => {
    const fault = classifyAuthError('Invalid API key');
    expect(fault.kind).toBe('configuration');
    expect(fault.message).toContain('Nothing is wrong with what you typed');
    expect(fault.message).toContain('/diagnostics');
  });

  it('never shows Supabase’s raw wording for a configuration fault', () => {
    for (const raw of ['Invalid API key', 'No API key found in request', 'JWT expired']) {
      expect(classifyAuthError(raw).message).not.toContain('API key');
    }
  });

  it('separates the faults the reader can act on from the ones they cannot', () => {
    expect(classifyAuthError('User already registered').kind).toBe('credentials');
    expect(classifyAuthError('Password should be at least 6 characters').kind).toBe('credentials');
    expect(classifyAuthError('Invalid login credentials').kind).toBe('credentials');
    expect(classifyAuthError('Signups not allowed for this instance').kind).toBe('service');
    expect(classifyAuthError('Error sending confirmation email').kind).toBe('service');
    expect(classifyAuthError('Database error saving new user').kind).toBe('configuration');
    expect(classifyAuthError('fetch failed').kind).toBe('configuration');
  });

  it('matches regardless of case', () => {
    expect(classifyAuthError('invalid api key').kind).toBe('configuration');
    expect(classifyAuthError('INVALID API KEY').kind).toBe('configuration');
  });

  it('treats a non-JSON answer as a wrong address, not a mystery', () => {
    // supabase-js surfaces this when something that is not Supabase answers —
    // a proxy or an error page. Verified by submitting the real form against
    // a host the network refused to route to.
    const fault = classifyAuthError(`Unexpected token 'H', "Host not i"... is not valid JSON`);
    expect(fault.kind).toBe('configuration');
    expect(fault.message).toContain('was not Supabase');
    expect(fault.message).not.toContain('Unexpected token');
  });

  it('does not name the wrong action — this also answers the sign-up form', () => {
    expect(classifyAuthError('some entirely new error').message).not.toMatch(/sign.?in/i);
    expect(classifyAuthError('').message).not.toMatch(/sign.?in/i);
  });

  it('says something useful about a message it does not recognise', () => {
    const fault = classifyAuthError('some entirely new error');
    expect(fault.message).toContain('some entirely new error');
    expect(fault.message).toContain('/diagnostics');
  });

  it('handles an empty or missing message without producing a dangling sentence', () => {
    for (const value of [undefined, null, '', '   ']) {
      const message = classifyAuthError(value).message;
      expect(message).not.toMatch(/: \.|: $/);
      expect(message.length).toBeGreaterThan(20);
    }
  });
});

describe('signInErrorMessage', () => {
  it('stays vague about which half was wrong, so the form cannot enumerate accounts', () => {
    expect(signInErrorMessage('Invalid login credentials')).toBe(INVALID_CREDENTIALS);
  });

  it('names an unconfirmed address, which is only reachable with the right password', () => {
    // Hiding it behind the vague message leaves a real user circling: told
    // here that their details are wrong, and on the sign-up form that their
    // account already exists.
    expect(signInErrorMessage('Email not confirmed')).toContain('confirmed');
  });

  it('does not blame the reader for a fault in the deployment', () => {
    const message = signInErrorMessage('Invalid API key');
    expect(message).not.toBe(INVALID_CREDENTIALS);
    expect(message).toContain('/diagnostics');
  });
});
