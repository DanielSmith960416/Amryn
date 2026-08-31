import 'server-only';

/**
 * The invitation email.
 *
 * For most recipients this is the first thing they will see of the platform,
 * and it is asking them to click a link and sign in — which is exactly the
 * shape of a phishing message. So it says who invited them, by name and
 * address, which organisation, and which role: enough for the reader to decide
 * it is genuine without taking anything on trust.
 *
 * Plain text and HTML both. A text part is not a formality — some clients show
 * it, some people prefer it, and a message without one is more likely to be
 * treated as spam.
 */
import type { Message } from './smtp';

export interface InvitationEmail {
  to: string;
  organisation: string;
  roleLabel: string;
  /** Who sent it, for the reader to recognise. */
  inviterName: string;
  inviterEmail: string;
  link: string;
  expiresInDays: number;
}

/** Escaped for HTML. Every value here comes from a person, including the organisation name. */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function invitationEmail(invitation: InvitationEmail): Message {
  const { organisation, roleLabel, inviterName, inviterEmail, link, expiresInDays } = invitation;

  const subject = `${inviterName} has invited you to ${organisation} on Amryn`;

  const text = [
    `${inviterName} (${inviterEmail}) has invited you to join ${organisation} on Amryn,`,
    `as ${roleLabel}.`,
    '',
    'Accept the invitation here:',
    link,
    '',
    `The link works only for this email address and expires in ${expiresInDays} days.`,
    '',
    'If you were not expecting this, you can ignore it — nothing happens until',
    'you follow the link and sign in.',
    '',
    '—',
    'Amryn AIGrowthIntelligence',
  ].join('\n');

  // Inline styles and a table: an email client is not a browser, and most
  // strip <style> blocks and support little of the box model.
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#081b33;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dce3ee;border-radius:10px;">
    <tr>
      <td style="padding:28px 28px 0;">
        <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#004aad;font-weight:600;">Amryn</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 0;">
        <h1 style="margin:0;font-size:20px;line-height:1.3;font-weight:600;color:#081b33;">
          You have been invited to ${escape(organisation)}
        </h1>
        <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#46566e;">
          ${escape(inviterName)} (${escape(inviterEmail)}) has invited you to join
          <strong style="color:#081b33;">${escape(organisation)}</strong> as
          <strong style="color:#081b33;">${escape(roleLabel)}</strong>.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px 0;">
        <a href="${escape(link)}"
           style="display:inline-block;background:#004aad;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">
          Accept the invitation
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px 0;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6f7f96;">
          The link works only for this email address and expires in ${expiresInDays} days.
          If the button does not work, copy this into your browser:
        </p>
        <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#46566e;word-break:break-all;font-family:ui-monospace,Menlo,Consolas,monospace;">
          ${escape(link)}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px 28px;">
        <p style="margin:0;padding-top:16px;border-top:1px solid #dce3ee;font-size:12px;line-height:1.6;color:#6f7f96;">
          If you were not expecting this, you can ignore it — nothing happens until you
          follow the link and sign in.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: invitation.to, subject, text, html };
}
