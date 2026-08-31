import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LEGAL_VERSION,
  PROCESSING,
  PROCESSORS,
  REGULATOR,
  RESPONSIBLE_PARTY,
  RETENTION,
} from '@/lib/legal/documents';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Amryn collects, uses and protects personal information, under POPIA.',
};

/**
 * The privacy policy.
 *
 * Structured around what POPIA section 18 requires a data subject to be told:
 * who is responsible, what is collected, why, on what lawful basis, who else
 * sees it, whether it leaves the country, how long it is kept, and how to
 * complain. Written to be read by the person it concerns rather than to
 * survive a dispute — a policy nobody finishes is not notice.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">
        Version {LEGAL_VERSION} · Governed by the Protection of Personal Information Act 4 of 2013
        (POPIA)
      </p>

      <p>
        This explains what Amryn does with personal information, why, and what you can require of
        us. It is written to be read. If anything in it is unclear, ask — an explanation you cannot
        follow is not notice.
      </p>

      <h2>Who is responsible</h2>
      <p>
        <strong>{RESPONSIBLE_PARTY.legalName}</strong> (registration number{' '}
        {RESPONSIBLE_PARTY.registrationNumber}), of {RESPONSIBLE_PARTY.address}, is the responsible
        party for the personal information described below.
      </p>
      <p>
        Our Information Officer is {RESPONSIBLE_PARTY.informationOfficer}, reachable at{' '}
        {RESPONSIBLE_PARTY.informationOfficerEmail}. They are the person to contact about anything
        on this page.
      </p>

      <h3>Where your organisation is responsible instead</h3>
      <p>
        Amryn is a tool your organisation uses to analyse its own business. The business data your
        organisation puts into it — customers, staff records, opportunities, documents — belongs to
        that organisation, and where it contains other people&rsquo;s personal information{' '}
        <strong>your organisation is the responsible party and we are its operator</strong>. We
        process that data on your organisation&rsquo;s instruction, not for our own purposes. If
        you are the subject of information held in someone&rsquo;s Amryn workspace, they are the
        party to approach; we will help them respond.
      </p>

      <h2>What we collect, and why</h2>
      <p>
        Every category below has a stated purpose and a lawful basis. We do not collect personal
        information because it might one day be useful.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>What it includes</th>
              <th>Why</th>
              <th>Lawful basis</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSING.map((row) => (
              <tr key={row.category}>
                <td>
                  <strong>{row.category}</strong>
                </td>
                <td>{row.items}</td>
                <td>{row.purpose}</td>
                <td>{row.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>What we do not do</h3>
      <ul>
        <li>We do not sell personal information, and we do not share it for advertising.</li>
        <li>
          We do not use your organisation&rsquo;s business data to train machine-learning models,
          our own or anyone else&rsquo;s.
        </li>
        <li>
          We do not read your organisation&rsquo;s data except where you ask us to help with a
          support request, or where the law requires it.
        </li>
      </ul>

      <h2>Who else sees it</h2>
      <p>
        We use a small number of service providers to run the platform. Each is bound to process
        personal information only on our instruction, and none of them receives it for their own
        purposes.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>What for</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map((row) => (
              <tr key={row.name}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>{row.purpose}</td>
                <td>{row.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Information leaving South Africa</h3>
      <p>
        Some of those providers operate outside South Africa, so personal information is
        transferred across borders. POPIA section 72 permits this where the recipient is bound by
        an agreement upholding principles substantially similar to POPIA&rsquo;s. Our agreements
        with these providers do that. If you would rather your organisation&rsquo;s data stayed in
        a particular region, tell us before you begin — the database region is chosen once and
        cannot be moved afterwards.
      </p>

      <h2>How long we keep it</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>What</th>
              <th>How long</th>
            </tr>
          </thead>
          <tbody>
            {RETENTION.map((row) => (
              <tr key={row.what}>
                <td>
                  <strong>{row.what}</strong>
                </td>
                <td>{row.period}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>How it is protected</h2>
      <ul>
        <li>
          <strong>Each organisation is isolated in the database itself.</strong> Which rows a person
          can read is decided by the database, not by the application, so a mistake in the interface
          cannot show one organisation another&rsquo;s data.
        </li>
        <li>
          <strong>Passwords are never stored.</strong> Only a one-way hash is kept, which cannot be
          turned back into your password by us or by anyone who obtained it.
        </li>
        <li>Everything travels over an encrypted connection, and is encrypted at rest.</li>
        <li>
          Repeated sign-in attempts are limited, and the identifiers used to do that are stored only
          as hashes — we count attempts without recording who made them.
        </li>
        <li>
          Sign-ins, permission changes and organisation changes are recorded so we can answer what
          happened to an account.
        </li>
      </ul>
      <p>
        If personal information is ever compromised in a way that could harm you, we will notify you
        and the Information Regulator as POPIA section 22 requires, as soon as reasonably possible
        after establishing what happened.
      </p>

      <h2>Your rights</h2>
      <p>Under POPIA you may:</p>
      <ul>
        <li>Ask what personal information we hold about you, and receive a copy.</li>
        <li>Ask us to correct anything inaccurate, misleading or out of date.</li>
        <li>Ask us to delete information we no longer have a lawful reason to keep.</li>
        <li>Object to processing based on legitimate interest.</li>
        <li>Withdraw consent, where consent is what we relied on.</li>
        <li>Complain to the Information Regulator.</li>
      </ul>
      <p>
        The quickest route is <Link href="/settings/privacy">your privacy settings</Link>, which
        records a request and starts the clock. You can also write to{' '}
        {RESPONSIBLE_PARTY.informationOfficerEmail}. We will respond within 30 days, and tell you
        plainly if we cannot do what you asked and why.
      </p>
      <p>
        One limit worth stating: where your employer is the responsible party for records about you
        in their workspace, we cannot delete those on your instruction alone. We will pass the
        request to them and say so.
      </p>

      <h2>Complaining</h2>
      <p>
        If you are not satisfied with how we have handled something, you may complain to the{' '}
        {REGULATOR.name} at <a href={REGULATOR.complaints}>{REGULATOR.complaints}</a>, or by email
        to {REGULATOR.email}. You do not have to come to us first, though we would rather you did.
      </p>

      <h2>Changes</h2>
      <p>
        When this policy changes materially we will tell account holders before the change takes
        effect, and ask you to accept the new version. Your existing acceptance is recorded against
        the version you agreed to, so consent to one wording is never treated as consent to
        another.
      </p>
    </>
  );
}
