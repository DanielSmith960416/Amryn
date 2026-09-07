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
 *
 * The implementation moved to transport.ts so the worker can email a morning
 * brief; `server-only` is a marker for the React bundler and would make the
 * worker build refuse the file. Every existing caller imports this module and
 * is guarded exactly as before.
 */
export {
  smtpConfig,
  isEmailConfigured,
  redactSmtpError,
  sendMail,
  verifySmtp,
  type SmtpConfig,
  type SendResult,
  type Message,
} from './transport';
