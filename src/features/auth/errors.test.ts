import { describe, expect, it, vi } from 'vitest';
import { INVALID_CREDENTIALS, authAttempt, classifyAuthError, reportAuthFault, signInErrorMessage } from './errors';

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

/**
 * The failure that never reached this file until now.
 *
 * Every auth call was written as `const { error } = await supabase.auth.…`,
 * which is right for anything the auth server replies with and wrong for the
 * cases where it never replies: supabase-js throws. Those went straight past
 * the classifier, out of the server action, and into Next's error boundary —
 * so a dropped connection mid-sign-in showed "Something failed on the server"
 * over a form that had been working a second earlier.
 */
describe('authAttempt', () => {
  it('passes a returned error through unchanged', async () => {
    const failure = await authAttempt(async () => ({
      error: { message: 'Invalid login credentials' },
    }));
    expect(failure).toBe('Invalid login credentials');
  });

  it('reports success as null, so the caller reads `if (failure)`', async () => {
    expect(await authAttempt(async () => ({ error: null }))).toBeNull();
  });

  it('catches a throw instead of letting it reach the error boundary', async () => {
    const failure = await authAttempt(async () => {
      throw new TypeError('fetch failed');
    });
    expect(failure).toContain('fetch failed');
    // Classified as ours rather than as the reader's, by the pattern that has
    // always been there — what changed is that a *thrown* failure now reaches
    // it at all instead of escaping to the error boundary.
    expect(classifyAuthError(failure).kind).toBe('configuration');
  });

  /*
   * "fetch failed" on its own names nothing. undici puts the real reason on
   * Error.cause, and that is what tells a connection refused from a name that
   * does not resolve when somebody reads the log.
   */
  it('keeps the cause, which is where the real reason lives', async () => {
    const thrown = new TypeError('fetch failed', {
      cause: new Error('connect ECONNREFUSED 127.0.0.1:443'),
    });
    const failure = await authAttempt(async () => {
      throw thrown;
    });
    expect(failure).toContain('fetch failed');
    expect(failure).toContain('ECONNREFUSED');
  });

  it('survives something thrown that is not an Error at all', async () => {
    const failure = await authAttempt(async () => {
      throw 'nope';
    });
    expect(typeof failure).toBe('string');
  });
});

describe('a network fault reads differently from a wrong password', () => {
  it('does not blame what was typed', () => {
    const network = classifyAuthError('fetch failed (connect ECONNREFUSED)');
    expect(network.kind).toBe('configuration');
    expect(network.message).toMatch(/fault on our side/i);
    expect(network.message).not.toMatch(/password|credential/i);
    // And it says where to look, for whoever runs the deployment.
    expect(network.detail).toMatch(/diagnostics/i);
  });

  it('covers the shapes a thrown failure actually arrives in', () => {
    for (const thrown of [
      'fetch failed',
      'fetch failed (connect ECONNREFUSED 127.0.0.1:443)',
      'fetch failed (getaddrinfo ENOTFOUND db.example.supabase.co)',
      'fetch failed (read ECONNRESET)',
      'fetch failed (connect ETIMEDOUT)',
      'socket hang up',
    ]) {
      expect(classifyAuthError(thrown).kind, thrown).toBe('configuration');
    }
  });

  it('is a different sentence from every other failure the forms can show', () => {
    const messages = [
      classifyAuthError('Invalid login credentials').message,
      classifyAuthError('Email not confirmed').message,
      classifyAuthError('fetch failed').message,
      classifyAuthError('some unrecognised thing').message,
      classifyAuthError('Request rate limit reached').message,
    ];
    expect(new Set(messages).size).toBe(messages.length);
  });

  /*
   * Order matters: "fetch failed" is generic enough that a more specific
   * message must still win, or a misconfigured key would be reported as a
   * network problem and nobody would fix the key.
   */
  it('does not swallow a more specific fault that happens to mention a timeout', () => {
    expect(classifyAuthError('Invalid API key').kind).not.toBe('network');
    expect(classifyAuthError('Email not confirmed').kind).toBe('unconfirmed');
  });
});
