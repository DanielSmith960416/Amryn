import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_VERSION, RESPONSIBLE_PARTY } from '@/lib/legal/documents';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The agreement between Amryn and the organisations that use it.',
};

/**
 * The terms of service.
 *
 * Written in the second person and in ordinary sentences. A term nobody
 * understands is a term nobody agreed to, and an agreement drafted only to be
 * defended is not an agreement anybody entered into knowingly.
 */
export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="updated">Version {LEGAL_VERSION} · Governed by the law of South Africa</p>

      <p>
        These terms are the agreement between{' '}
        <strong>{RESPONSIBLE_PARTY.legalName}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;) and the
        person or organisation using Amryn (&ldquo;you&rdquo;). Creating an account means accepting
        them.
      </p>

      <h2>1. What Amryn is</h2>
      <p>
        Amryn is software your organisation uses to analyse its own business — performance,
        customers, opportunities, risks and market signals — and to act on what it finds. We provide
        the software. The data, the judgement and the decisions remain yours.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be 18 or older, and entitled to act for the organisation you register.</li>
        <li>
          Keep your password to yourself. Anything done with your credentials is treated as done by
          you, so tell us immediately if you think someone else has them.
        </li>
        <li>
          Give us accurate details. An account registered under a false name is one we may close.
        </li>
        <li>
          Accounts are personal. Sharing one between colleagues defeats every record we keep of who
          did what — invite them instead.
        </li>
      </ul>

      <h2>3. Organisations, members and roles</h2>
      <p>
        Whoever creates an organisation becomes its administrator and may invite others and set what
        each of them may see. An administrator acts for the organisation: their decisions about
        access, data and closure bind every member.
      </p>
      <p>
        If you were invited to an organisation, your access exists at that organisation&rsquo;s
        discretion and can be withdrawn by its administrators at any time.
      </p>

      <h2>4. Your data stays yours</h2>
      <p>
        Everything you put into Amryn belongs to you. We claim no ownership of it. We hold the
        limited licence needed to store it, process it and show it back to you — which is what
        running the service consists of — and nothing beyond that.
      </p>
      <p>
        We do not use your business data to train machine-learning models, ours or anyone
        else&rsquo;s, and we do not sell it. How we handle personal information is set out in the{' '}
        <Link href="/legal/privacy">Privacy Policy</Link>; where your data includes information
        about other people, the{' '}
        <Link href="/legal/dpa">Data Processing Addendum</Link> governs our handling of it.
      </p>
      <p>
        You may export your data at any time while your account is open. On closure we keep it for
        30 days so an accidental closure can be undone, and then delete it.
      </p>

      <h2>5. What you may not do</h2>
      <ul>
        <li>Upload anything you have no right to hold, or that is unlawful.</li>
        <li>Attempt to reach another organisation&rsquo;s data, or to test our defences uninvited.</li>
        <li>
          Use the service to build a competing product, or resell access without our written
          agreement.
        </li>
        <li>
          Load it deliberately beyond reasonable use, or automate against it in a way that degrades
          it for others.
        </li>
        <li>Remove or obscure ownership notices in the software.</li>
      </ul>

      <h2>6. What the analysis is, and is not</h2>
      <p>
        Amryn produces scores, forecasts, recommendations and — where an AI provider is configured —
        written summaries. These are analytical outputs based on the data available to them. They
        are decision support.{' '}
        <strong>
          They are not financial, legal, tax or professional advice, and no forecast is a promise
          about the future.
        </strong>
      </p>
      <p>
        Judgement stays with you. Check anything material before acting on it, particularly where
        the underlying data is incomplete — the platform tells you when it is.
      </p>

      <h2>7. Availability</h2>
      <p>
        We work to keep Amryn available and will give notice of planned maintenance where we can.
        Unless a separate written service level agreement says otherwise, the service is provided as
        it stands, without a guaranteed level of availability. We depend on hosting and network
        providers whose outages are not within our control.
      </p>

      <h2>8. Fees</h2>
      <p>
        Where a paid plan applies, the fees, billing period and included limits are those shown when
        you subscribe. Fees are payable in advance and are stated exclusive of VAT unless said
        otherwise. We will give at least 30 days&rsquo; notice before a price change, and you may
        cancel before it takes effect. Cancelling stops the next renewal; it does not refund the
        current period.
      </p>

      <h2>9. Ending the agreement</h2>
      <p>
        You may close your account at any time from your settings. We may suspend or close an
        account that breaches these terms, that is being used unlawfully, or where fees have gone
        unpaid after we have asked. Except where the law requires immediate action, we will tell you
        first and give you a chance to put it right.
      </p>

      <h2>10. Liability</h2>
      <p>
        Nothing here limits liability for death or personal injury caused by negligence, for fraud,
        or for anything that cannot lawfully be limited — including our obligations under POPIA.
      </p>
      <p>
        Subject to that, neither party is liable for indirect or consequential loss, or for lost
        profits, revenue or anticipated savings. Our total liability arising out of this agreement
        in any 12-month period is limited to the fees you paid us in that period, or R10 000 where
        no fees were paid.
      </p>
      <p>
        You remain responsible for the data you put in and for the decisions you take on the
        strength of what the platform shows you.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may change these terms. Where a change is material we will tell account holders before it
        takes effect and ask you to accept the new version. Your acceptance is recorded against the
        version you agreed to. Continuing to use Amryn after a change takes effect, having been
        told, means accepting it.
      </p>

      <h2>12. Law and disputes</h2>
      <p>
        South African law governs this agreement, and the courts of South Africa have jurisdiction.
        Before going to court, please raise the problem with us — most things are quicker to fix
        than to argue about.
      </p>

      <h2>13. Reaching us</h2>
      <p>
        Write to {RESPONSIBLE_PARTY.supportEmail}, or to {RESPONSIBLE_PARTY.legalName} at{' '}
        {RESPONSIBLE_PARTY.address}.
      </p>
    </>
  );
}
