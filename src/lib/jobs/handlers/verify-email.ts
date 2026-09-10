import { smtpConfig, verifySmtp } from '@/lib/email/transport';
import type { JobHandler } from '../types';

/**
 * Asks the mail server whether it will accept us, and writes down the answer.
 *
 * /diagnostics already does this, and needs somebody signed in as an
 * administrator standing in front of it. That is the wrong shape for two
 * situations that both matter:
 *
 *   · Mail is broken and the person who can fix it is not the person who can
 *     sign in. The settings live on the deployment; the administrator lives
 *     somewhere else.
 *   · Nobody has looked. Invitations fail quietly — the link is still shown to
 *     whoever created it, so the platform carries on working and the only
 *     evidence is an email that never arrives.
 *
 * Running it as a job puts the answer in the database, where the next person
 * to ask can read it without holding the credentials.
 *
 * ── nothing here can leak the password ──────────────────────────────────
 *
 * The result carries host, port and the redacted reason. Host and port are not
 * secrets and /diagnostics has always printed them — they are also the two
 * settings most often wrong, so withholding them would defeat the purpose.
 *
 * The reason goes through redactSmtpError, which replaces the password and the
 * username wherever they appear, including base64-encoded as SMTP sends them
 * during AUTH, and blanks any remaining AUTH line whatever it carries. A job
 * result is readable by anyone who can read the queue, so this is the
 * difference between a diagnostic and an incident.
 */
export const verifyEmail: JobHandler = {
  kind: 'email.verify',
  description: 'Checks that the mail server accepts our settings, and records why not.',
  // Longer than the default, and longer than the transport's own ten-second
  // connection and greeting timeouts, so nodemailer finishes and names the
  // fault rather than being cut off with "no answer".
  leaseSeconds: 60,

  async run({ log }) {
    const config = smtpConfig();

    if (!config) {
      log('no mail service is configured');
      return { configured: false };
    }

    const started = Date.now();
    const result = await verifySmtp();
    const seconds = Math.round((Date.now() - started) / 100) / 10;

    if (result.ok) {
      log(`${config.host}:${config.port} accepted the credentials in ${seconds}s`);
      return {
        configured: true,
        ok: true,
        host: config.host,
        port: config.port,
        secure: config.secure,
        seconds,
      };
    }

    /*
     * Not thrown. A failure here is the answer the job was asked for, not the
     * job failing — throwing would retry it three times against a mail server
     * that is going to refuse three times, and would bury the reason in an
     * error column rather than putting it in the result where it is read.
     */
    log(`${config.host}:${config.port} refused after ${seconds}s — ${result.problem}`);
    return {
      configured: true,
      ok: false,
      host: config.host,
      port: config.port,
      secure: config.secure,
      seconds,
      problem: result.problem,
    };
  },
};
