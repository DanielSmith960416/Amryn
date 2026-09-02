import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SMTPServer } from 'smtp-server';
import { simpleParser, type ParsedMail } from 'mailparser';

/**
 * The mail path against a real SMTP server.
 *
 * The other tests here cover the shape of the message and the redaction of
 * errors. Neither proves anything is delivered — only a server accepting a
 * connection, authenticating it and receiving the bytes does that, and the
 * mistakes worth catching (a wrong TLS mode, a message with no text part, a
 * password echoed into an error) all live in that gap.
 */
vi.mock('server-only', () => ({}));

const { verifySmtp, sendMail } = await import('./smtp');
const { invitationEmail } = await import('./invitation');

const PORT = 2526;
const USER = 'amryn-test';
const PASSWORD = 'sup3r-s3cret-mail-password';
const LINK = 'https://app.amryn.ai/invite/REAL-TOKEN-VALUE';

let server: SMTPServer;
let received: ParsedMail | null = null;

function configure(overrides: Record<string, string> = {}) {
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(PORT),
    SMTP_USER: USER,
    SMTP_PASSWORD: PASSWORD,
    SMTP_FROM: 'Amryn <no-reply@amryn.test>',
    ...overrides,
  });
}

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: false,
    // A loopback stand-in: the client's behaviour is what is under test, not
    // the transport.
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _session, callback) {
      if (auth.username === USER && auth.password === PASSWORD) {
        return callback(null, { user: USER });
      }
      return callback(new Error('535 Authentication credentials invalid'));
    },
    onData(stream, _session, callback) {
      simpleParser(stream).then((mail) => {
        received = mail;
        callback();
      }, callback);
    },
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  configure();
});

afterAll(() => {
  server.close();
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    delete process.env[key];
  }
});

describe('against a real SMTP server', () => {
  it('connects and authenticates', async () => {
    configure();
    await expect(verifySmtp()).resolves.toEqual({ ok: true });
  });

  it('delivers the invitation, and the server receives it', async () => {
    configure();
    received = null;

    const result = await sendMail(
      invitationEmail({
        to: 'colleague@example.com',
        organisation: 'Highveld Supply Co',
        roleLabel: 'Branch manager',
        inviterName: 'Daniel Smith',
        inviterEmail: 'daniel@highveld.example',
        link: LINK,
        expiresInDays: 14,
      }),
    );
    expect(result.ok).toBe(true);

    await vi.waitFor(() => expect(received).not.toBeNull(), { timeout: 5_000 });

    // `to` is one address object or an array of them, depending on the header.
    const to = Array.isArray(received!.to) ? received!.to[0] : received!.to;
    expect(to?.text).toBe('colleague@example.com');
    expect(received!.from?.text).toContain('no-reply@amryn.test');
    expect(received!.subject).toBe('Daniel Smith has invited you to Highveld Supply Co on Amryn');

    // Both parts, and the link in each. A message with only HTML is more
    // likely to be filtered, and a client showing only text would otherwise
    // present an invitation with no way to accept it.
    expect(received!.text).toContain(LINK);
    expect(received!.html).toContain(LINK);
  });

  it('reports a refused password without repeating it', async () => {
    configure({ SMTP_PASSWORD: 'wrong-password-entirely' });
    const result = await verifySmtp();

    expect(result.ok).toBe(false);
    expect(result.problem).toBeTruthy();
    // The whole point of redactSmtpError, proved against a server that really
    // does reject and really does say so.
    expect(result.problem).not.toContain('wrong-password-entirely');
  });

  it('fails on an unreachable host rather than hanging past a function budget', async () => {
    configure({ SMTP_PORT: '2599' });
    const started = Date.now();
    const result = await verifySmtp();

    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(12_000);
  }, 20_000);

  it('says so plainly when nothing is configured', async () => {
    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    await expect(verifySmtp()).resolves.toEqual({
      ok: false,
      problem: 'No mail service is configured.',
    });
    process.env.SMTP_HOST = host;
  });
});
