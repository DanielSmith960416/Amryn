import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_VERSION, PROCESSING, PROCESSORS, RESPONSIBLE_PARTY } from '@/lib/legal/documents';

export const metadata: Metadata = {
  title: 'Data Processing Addendum',
  description:
    'The operator agreement POPIA section 21 requires between Amryn and the organisations that use it.',
};

/**
 * The data processing addendum.
 *
 * POPIA section 21 obliges a responsible party to secure a written agreement
 * with any operator processing personal information on its behalf. An
 * organisation using Amryn to hold records about its customers and staff is
 * that responsible party; we are that operator. This is the written agreement,
 * accepted when an administrator sets the organisation up rather than sent as
 * an attachment months later.
 */
export default function DpaPage() {
  return (
    <>
      <h1>Data Processing Addendum</h1>
      <p className="updated">
        Version {LEGAL_VERSION} · Required by section 21 of the Protection of Personal Information
        Act 4 of 2013
      </p>

      <p>
        This addendum forms part of the <Link href="/legal/terms">Terms of Service</Link> and
        applies whenever your organisation puts personal information about other people —
        customers, employees, contacts — into Amryn. It is accepted by the administrator who sets
        the organisation up, on the organisation&rsquo;s behalf.
      </p>

      <h2>1. Who is who</h2>
      <p>
        <strong>Your organisation is the responsible party.</strong> You decide what personal
        information goes into Amryn, why, and for how long. You are answerable to the people that
        information is about.
      </p>
      <p>
        <strong>{RESPONSIBLE_PARTY.legalName} is the operator.</strong> We process that information
        only to provide the service, on your instruction, and for no purpose of our own.
      </p>
      <p>
        Separately, we are the responsible party for account and security records about the
        individuals who sign in — their names, addresses and sign-in history. That is covered by the{' '}
        <Link href="/legal/privacy">Privacy Policy</Link>, not by this addendum.
      </p>

      <h2>2. What we process for you</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Subject matter</th>
              <th>Whatever your organisation chooses to record in Amryn</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Duration</strong>
              </td>
              <td>For as long as your organisation&rsquo;s account is open, plus 30 days</td>
            </tr>
            <tr>
              <td>
                <strong>Nature and purpose</strong>
              </td>
              <td>
                Storing, organising and analysing your business records so the platform can report
                on them
              </td>
            </tr>
            <tr>
              <td>
                <strong>Types of information</strong>
              </td>
              <td>
                Typically names, contact details, commercial terms and correspondence. You control
                this; if you enter special personal information or children&rsquo;s information,
                the additional obligations in POPIA sections 26 to 35 are yours to satisfy.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Data subjects</strong>
              </td>
              <td>Your customers, prospects, employees and contacts</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The categories the platform itself collects, and the basis for each, are listed in the
        Privacy Policy — {PROCESSING.length} in total.
      </p>

      <h2>3. What we undertake</h2>
      <ul>
        <li>
          <strong>To process only on your instruction.</strong> Using the platform is the
          instruction. We will not process your organisation&rsquo;s data for any other purpose, and
          if the law ever compels us to, we will tell you first unless that law forbids it.
        </li>
        <li>
          <strong>To keep it confidential</strong>, as POPIA section 20 requires, and to bind
          everyone with access to the same duty.
        </li>
        <li>
          <strong>To secure it</strong> with the measures in clause 5, and to keep them
          appropriate as risks change.
        </li>
        <li>
          <strong>To help you answer the people it concerns.</strong> If someone asks your
          organisation what you hold about them, or asks you to correct or delete it, we will give
          you what you need to answer within a reasonable time.
        </li>
        <li>
          <strong>To tell you about a breach.</strong> Where there are reasonable grounds to believe
          your organisation&rsquo;s data has been accessed or acquired by anyone unauthorised, we
          will notify you as soon as reasonably possible after establishing what happened, with what
          we know — so that you can make the notifications POPIA section 22 requires of you.
        </li>
        <li>
          <strong>To return or delete it</strong> when your account ends, at your choice, except
          where the law requires us to keep something.
        </li>
      </ul>

      <h2>4. Sub-operators</h2>
      <p>
        We use the providers below to run the platform. Each is bound to obligations no weaker than
        ours, and none processes your data for its own purposes. We remain answerable to you for
        what they do.
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
      <p>
        We will give you reasonable notice before adding or replacing one. If you object on
        reasonable data protection grounds, and we cannot accommodate you, you may end the
        agreement for the affected service without penalty.
      </p>

      <h3>Information leaving South Africa</h3>
      <p>
        Some of those providers operate outside South Africa. POPIA section 72 permits a
        cross-border transfer where the recipient is bound by an agreement that upholds principles
        substantially similar to POPIA&rsquo;s; our agreements with these providers do that. By
        accepting this addendum you authorise those transfers for the purpose of running the
        service.
      </p>

      <h2>5. Security measures</h2>
      <ul>
        <li>
          Each organisation&rsquo;s data is isolated by the database itself, so a fault in the
          interface cannot show one organisation another&rsquo;s records.
        </li>
        <li>Encryption in transit and at rest.</li>
        <li>
          Passwords stored only as one-way hashes; sign-in attempts rate limited against identifiers
          that are themselves hashed.
        </li>
        <li>
          Access inside the platform is decided by role and by explicit permission, and changes to
          either are recorded.
        </li>
        <li>
          Our staff do not read your data except where you ask us to help with a support request, or
          where the law requires it.
        </li>
        <li>Backups, so that data lost to a fault can be recovered.</li>
      </ul>

      <h2>6. Audit</h2>
      <p>
        On reasonable written notice, and no more than once a year unless a breach or a regulator
        requires otherwise, we will provide the information you reasonably need to satisfy yourself
        that this addendum is being kept — including our security documentation and any third-party
        assessments we hold.
      </p>

      <h2>7. What is yours to do</h2>
      <p>
        You warrant that you have a lawful basis for the personal information you put into Amryn,
        that you have given the people concerned the notice POPIA section 18 requires, and that your
        instructions to us are lawful. We are not in a position to check any of that, and it does
        not become our responsibility by our processing it.
      </p>

      <h2>8. Precedence</h2>
      <p>
        Where this addendum and the Terms of Service disagree about personal information, this
        addendum prevails. Everything else in the Terms continues to apply.
      </p>

      <h2>9. Signing</h2>
      <p>
        Acceptance is recorded when an administrator creates the organisation or accepts a new
        version: we store who accepted, when, and which version. If your organisation requires a
        countersigned paper copy, write to {RESPONSIBLE_PARTY.informationOfficerEmail} and we will
        provide one.
      </p>
    </>
  );
}
