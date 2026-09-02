import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `server-only` throws outside a server context; the guard it enforces at build
 * time is not what is under test here.
 */
vi.mock('server-only', () => ({}));

const { smtpConfig, isEmailConfigured, redactSmtpError } = await import('./smtp');

const PASSWORD = 're_L1ve_S3cret_KeyValue_abcdef';
const USER = 'resend';

function configure(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    SMTP_HOST: 'smtp.resend.com',
    SMTP_PORT: '587',
    SMTP_USER: USER,
    SMTP_PASSWORD: PASSWORD,
    SMTP_FROM: 'Amryn <no-reply@amryn.co.za>',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => configure());

afterEach(() => {
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_SECURE']) {
    delete process.env[key];
  }
  vi.unstubAllGlobals();
});

describe('smtpConfig', () => {
  it('reads the settings', () => {
    const config = smtpConfig();
    expect(config?.host).toBe('smtp.resend.com');
    expect(config?.port).toBe(587);
    expect(config?.from).toBe('Amryn <no-reply@amryn.co.za>');
  });

  it('derives TLS from the port, since getting that pair wrong is a hang', () => {
    // 465 is implicit TLS; 587 and 25 start in the clear and use STARTTLS.
    expect(smtpConfig()?.secure).toBe(false);
    configure({ SMTP_PORT: '465' });
    expect(smtpConfig()?.secure).toBe(true);
    configure({ SMTP_PORT: '25' });
    expect(smtpConfig()?.secure).toBe(false);
  });

  it('lets SMTP_SECURE override the port, for a server that disagrees', () => {
    configure({ SMTP_PORT: '2525', SMTP_SECURE: 'true' });
    expect(smtpConfig()?.secure).toBe(true);
    configure({ SMTP_PORT: '465', SMTP_SECURE: 'false' });
    expect(smtpConfig()?.secure).toBe(false);
  });

  it('defaults the port rather than producing NaN', () => {
    configure({ SMTP_PORT: undefined });
    expect(smtpConfig()?.port).toBe(587);
    configure({ SMTP_PORT: 'not a number' });
    expect(smtpConfig()?.port).toBe(587);
  });

  it('is undefined without a host or a from address', () => {
    // Both are required: a server with nothing to send from is not usable, and
    // half-configured mail should behave as no mail rather than as broken mail.
    configure({ SMTP_HOST: undefined });
    expect(smtpConfig()).toBeUndefined();
    configure({ SMTP_FROM: undefined });
    expect(smtpConfig()).toBeUndefined();
    configure({ SMTP_HOST: '   ' });
    expect(isEmailConfigured()).toBe(false);
  });

  it('allows a server with no authentication, which some internal relays are', () => {
    configure({ SMTP_USER: undefined, SMTP_PASSWORD: undefined });
    const config = smtpConfig();
    expect(config).toBeDefined();
    expect(config?.user).toBeUndefined();
  });

  it('refuses to be read in a browser', () => {
    vi.stubGlobal('window', {});
    expect(() => smtpConfig()).toThrow(/never be called in the browser/);
  });
});

describe('redactSmtpError', () => {
  it('removes the password an SMTP server quoted back', () => {
    const message = redactSmtpError(new Error(`535 Authentication failed for ${PASSWORD}`));
    expect(message).not.toContain(PASSWORD);
    expect(message).toContain('535 Authentication failed');
  });

  it('removes it base64-encoded, which is how AUTH actually sends it', () => {
    // nodemailer includes the failing command. AUTH LOGIN base64s the
    // credentials, which is encoding, not protection — the value is trivially
    // recoverable from a log or a screenshot.
    const encoded = Buffer.from(PASSWORD).toString('base64');
    const message = redactSmtpError(new Error(`Invalid login: 535 ${encoded}`));
    expect(message).not.toContain(encoded);
    expect(message).not.toContain(PASSWORD);
  });

  it('removes the username too', () => {
    expect(redactSmtpError(new Error(`no such user ${USER}`))).not.toContain(USER);
  });

  it('strips a whole AUTH line whatever it carries', () => {
    expect(redactSmtpError(new Error('failed on AUTH PLAIN dXNlcgBwYXNz'))).toBe(
      'failed on AUTH •••',
    );
  });

  it('leaves a message with no credentials in it alone', () => {
    const plain = 'Connection timeout at smtp.example.com:587';
    expect(redactSmtpError(new Error(plain))).toBe(plain);
  });

  it('handles a thrown non-Error', () => {
    expect(redactSmtpError('socket hang up')).toBe('socket hang up');
  });

  it('does not blank the message when no mail is configured', () => {
    configure({ SMTP_HOST: undefined });
    expect(redactSmtpError(new Error('some failure'))).toBe('some failure');
  });
});
