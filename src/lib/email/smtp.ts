import 'server-only';

/**
 * Sending mail.
 *
 * SMTP rather than one provider's API, because the choice is not ours to make:
 * Resend, SendGrid, Postmark, Mailgun and a company's own mail server all speak
 * it, and a business already running Microsoft 365 should not have to sign up
 * for anything to send an invitation.
 *
 * Optional throughout. With nothing configured the platform behaves exactly as
 * it did before — an invitation is created and its link is shown to the person
 * who will pass it on. Adding mail makes that automatic; it never becomes a
 * prerequisite for inviting somebody.
 */
import nodemailer, { type Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS from the first byte, as port 465 expects. */
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/**
 * Server-only. The password is a credential like any other: never prefixed
 * NEXT_PUBLIC_, never read where it could reach a browser bundle.
 */
export function smtpConfig(): SmtpConfig | undefined {
  if (typeof window !== 'undefined') {
    throw new Error('smtpConfig() must never be called in the browser');
  }

  const host = present(process.env.SMTP_HOST);
  const from = present(process.env.SMTP_FROM);
  if (!host || !from) return undefined;

  const port = Number.parseInt(present(process.env.SMTP_PORT) ?? '587', 10) || 587;

  return {
    host,
    port,
    // 465 is implicit TLS; 587 and 25 start in the clear and upgrade with
    // STARTTLS. Getting this backwards is the classic SMTP hang — the client
    // waits for a greeting that will never arrive in the form it expects — so
    // it is derived from the port rather than left as another setting to get
    // wrong. SMTP_SECURE overrides it for the rare server that disagrees.
    secure: present(process.env.SMTP_SECURE)
      ? process.env.SMTP_SECURE!.trim().toLowerCase() === 'true'
      : port === 465,
    user: present(process.env.SMTP_USER),
    password: present(process.env.SMTP_PASSWORD),
    from,
  };
}

export function isEmailConfigured(): boolean {
  return smtpConfig() !== undefined;
}

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * An SMTP error, with anything secret taken out.
 *
 * Servers quote the credentials they rejected, and nodemailer includes the
 * command it sent — which for AUTH LOGIN is the password, base64-encoded and
 * therefore not hidden at all.
 */
export function redactSmtpError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const config = smtpConfig();
  let message = raw;

  for (const secret of [config?.password, config?.user]) {
    if (secret && secret.length > 0) {
      message = message.split(secret).join('•••');
      // The same value as SMTP sends it during AUTH.
      message = message.split(Buffer.from(secret).toString('base64')).join('•••');
    }
  }

  // Any remaining AUTH line, whatever it carries.
  return message.replace(/AUTH\s+\S+\s+\S+/gi, 'AUTH •••');
}

function transport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    // A serverless function has a budget, and an unreachable mail host would
    // otherwise consume all of it before failing.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export interface SendResult {
  ok: boolean;
  /** Why not, in words safe to show. Absent when it sent. */
  problem?: string;
}

export interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends one message, and never throws.
 *
 * The caller has already done something that must not be undone by a mail
 * failure — an invitation exists whether or not the email describing it
 * arrives — so a failure here is a fact to report, not an exception to
 * propagate.
 */
export async function sendMail(message: Message): Promise<SendResult> {
  const config = smtpConfig();
  if (!config) return { ok: false, problem: 'No mail service is configured.' };

  try {
    await transport(config).sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: redactSmtpError(error) };
  }
}

/**
 * Opens a connection and authenticates without sending anything.
 *
 * For the diagnostics page: settings that look right and a server that refuses
 * them are indistinguishable until something actually connects, and finding out
 * at the moment you invite a colleague is finding out too late.
 */
export async function verifySmtp(): Promise<SendResult> {
  const config = smtpConfig();
  if (!config) return { ok: false, problem: 'No mail service is configured.' };

  try {
    await transport(config).verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: redactSmtpError(error) };
  }
}
