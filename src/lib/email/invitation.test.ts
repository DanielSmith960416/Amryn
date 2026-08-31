import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { invitationEmail } = await import('./invitation');

const BASE = {
  to: 'colleague@example.com',
  organisation: 'Highveld Supply Co',
  roleLabel: 'Branch manager',
  inviterName: 'Daniel Smith',
  inviterEmail: 'daniel@highveld.example',
  link: 'https://amryn.vercel.app/invite/abc123token',
  expiresInDays: 14,
};

describe('invitationEmail', () => {
  it('says who invited them, where, and as what', () => {
    // The message asks someone to click a link and sign in, which is the shape
    // of a phishing email. Enough detail to recognise it as genuine is the
    // difference between being trusted and being deleted.
    const mail = invitationEmail(BASE);
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain('Daniel Smith');
      expect(part).toContain('daniel@highveld.example');
      expect(part).toContain('Highveld Supply Co');
      expect(part).toContain('Branch manager');
    }
  });

  it('names the sender and the organisation in the subject', () => {
    expect(invitationEmail(BASE).subject).toBe(
      'Daniel Smith has invited you to Highveld Supply Co on Amryn',
    );
  });

  it('carries the link in both parts, since some clients show only text', () => {
    const mail = invitationEmail(BASE);
    expect(mail.text).toContain(BASE.link);
    expect(mail.html).toContain(BASE.link);
    // And as a visible string in the HTML, not only inside href — a button
    // that a client strips would otherwise leave nothing to copy.
    expect(mail.html.split(BASE.link).length - 1).toBeGreaterThanOrEqual(2);
  });

  it('states the expiry, so an old link is a known quantity rather than a bug', () => {
    const mail = invitationEmail(BASE);
    expect(mail.text).toContain('14 days');
    expect(mail.html).toContain('14 days');
  });

  it('escapes HTML in every value that came from a person', () => {
    // An organisation name is typed by a user, and lands in an email that other
    // people open.
    const mail = invitationEmail({
      ...BASE,
      organisation: '<script>alert(1)</script> & Co',
      inviterName: 'Mallory "quotes" O\'Brien',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&amp; Co');
    expect(mail.html).toContain('&quot;quotes&quot;');
    expect(mail.html).toContain('&#39;Brien');
  });

  it('escapes the link, which ends up inside an href', () => {
    const mail = invitationEmail({
      ...BASE,
      link: 'https://amryn.vercel.app/invite/a"onmouseover="alert(1)',
    });
    expect(mail.html).not.toContain('onmouseover="alert');
    expect(mail.html).toContain('&quot;');
  });

  it('addresses it to the person invited', () => {
    expect(invitationEmail(BASE).to).toBe('colleague@example.com');
  });
});
