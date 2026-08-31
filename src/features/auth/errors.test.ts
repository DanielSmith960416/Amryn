import { describe, expect, it, vi } from 'vitest';
import {
  INVALID_CREDENTIALS,
  classifyAuthError,
  reportAuthFault,
  signInErrorMessage,
} from './errors';

/**
 * Words that belong in a server log and never under a password field. A
 * customer who reads any of these concludes, correctly, that they are looking
 * at somebody's console.
 */
const OPERATOR_WORDS = [
  'diagnostics',
  'api key',
  'anon',
  'supabase',
  'jwt',
  'migration',
  'schema',
  'smtp',
  'next_public',
  'deployment',
  'environment variable',
];

function assertReadable(message: string) {
  for (const word of OPERATOR_WORDS) {
    expect(message.toLowerCase()).not.toContain(word);
  }
}

describe('classifyAuthError', () => {
  it('calls a rejected API key a configuration fault, not the reader’s', () => {
    const fault = classifyAuthError('Invalid API key');
    expect(fault.kind).toBe('configuration');
    expect(fault.message).toContain('fault on our side');
  });

  it('never shows a customer the words the failure arrived in', () => {
    const raws = [
      'Invalid API key',
      'No API key found in request',
      'JWT expired',
      'fetch failed',
      `Unexpected token 'H', "Host not i"... is not valid JSON`,
      'Database error saving new user',
      'Error sending confirmation email',
      'some entirely new error',
      '',
    ];
    for (const raw of raws) assertReadable(classifyAuthError(raw).message);
  });

  it('does not echo the raw text back at the reader', () => {
    expect(classifyAuthError('some entirely new error').message).not.toContain(
      'some entirely new error',
    );
    expect(classifyAuthError(`Unexpected token 'H'`).message).not.toContain('Unexpected token');
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

  it('still tells an operator which setting to look at', () => {
    // The other half of saying nothing on screen. Without this the deployment
    // is broken and nothing anywhere says why.
    expect(classifyAuthError('Invalid API key').detail).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(classifyAuthError(`is not valid JSON`).detail).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(classifyAuthError('Database error saving new user').detail).toContain('migrations');
    expect(classifyAuthError('some entirely new error').detail).toContain('some entirely new error');
  });

  it('leaves no detail on a fault that is the reader’s own', () => {
    // Nothing for an operator to do, so nothing in the log to wade through.
    expect(classifyAuthError('Invalid login credentials').detail).toBeUndefined();
    expect(classifyAuthError('User already registered').detail).toBeUndefined();
  });

  it('does not name the wrong action — this also answers the sign-up form', () => {
    expect(classifyAuthError('some entirely new error').message).not.toMatch(/sign.?in/i);
    expect(classifyAuthError('').message).not.toMatch(/sign.?in/i);
  });

  it('handles an empty or missing message without producing a dangling sentence', () => {
    for (const value of [undefined, null, '', '   ']) {
      const message = classifyAuthError(value).message;
      expect(message).not.toMatch(/: \.|: $/);
      expect(message.length).toBeGreaterThan(20);
    }
  });
});

describe('reportAuthFault', () => {
  it('logs the setting at fault, with what the service said', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportAuthFault(classifyAuthError('Invalid API key'), 'Invalid API key');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(spy.mock.calls[0]?.[0]).toContain('Invalid API key');
    spy.mockRestore();
  });

  it('says nothing when the reader’s own details were at fault', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportAuthFault(classifyAuthError('Invalid login credentials'), 'Invalid login credentials');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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

  it('does not blame the reader for a fault that is ours', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = signInErrorMessage('Invalid API key');
    expect(message).not.toBe(INVALID_CREDENTIALS);
    expect(message).toContain('fault on our side');
    assertReadable(message);
    spy.mockRestore();
  });
});
