import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_VERSION, RESPONSIBLE_PARTY } from '@/lib/legal/documents';

export const metadata: Metadata = {
  title: 'Cookies',
  description: 'The small number of cookies Amryn sets, and what each one does.',
};

/**
 * The cookie notice.
 *
 * Short, because there is little to declare: no analytics, no advertising, no
 * third-party tracking. Saying so plainly is more useful than a consent banner
 * that asks permission for things we do not do.
 *
 * The table is written by hand rather than generated: a cookie notice
 * generated from the code would silently start telling the truth about a
 * tracker somebody added, instead of prompting the argument about whether to
 * add it.
 */
export default function CookiesPage() {
  return (
    <>
      <h1>Cookies</h1>
      <p className="updated">Version {LEGAL_VERSION}</p>

      <p>
        Amryn sets three cookies, all of them necessary for it to work. There is no analytics, no
        advertising, and nothing that follows you to other websites — so there is no banner asking
        you to accept any of it.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>What it does</th>
              <th>How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>sb-…-auth-token</strong>
              </td>
              <td>
                Keeps you signed in. Without it you would have to enter your password on every
                page.
              </td>
              <td>Until you sign out, or the session expires</td>
            </tr>
            <tr>
              <td>
                <strong>amryn.org</strong>
              </td>
              <td>
                Remembers which organisation you were last working in, when you belong to more than
                one. It is only a preference — what you may actually see is checked by the database
                on every request, so this cookie cannot grant access to anything.
              </td>
              <td>One year</td>
            </tr>
            <tr>
              <td>
                <strong>amryn.theme</strong>
              </td>
              <td>
                Remembers whether you chose the light, dark or navy appearance. Stored in your
                browser rather than sent to us.
              </td>
              <td>Until you clear your browser storage</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>What we do not set</h2>
      <ul>
        <li>No advertising or retargeting cookies.</li>
        <li>No third-party analytics, and no session recording.</li>
        <li>No social media pixels or embedded trackers.</li>
        <li>Nothing that follows you once you leave Amryn.</li>
      </ul>

      <h2>Turning them off</h2>
      <p>
        Your browser can block or delete cookies for this site. Blocking the sign-in cookie will
        stop you from signing in — that is what it is for — but blocking the other two only costs
        you the two preferences they hold.
      </p>

      <h2>If this changes</h2>
      <p>
        If we ever add anything that is not strictly necessary, we will ask for your consent before
        it is set, and this page will say what it is and why. Until then, the table above is the
        whole of it.
      </p>
      <p>
        Questions go to {RESPONSIBLE_PARTY.informationOfficerEmail}. What we do with personal
        information more broadly is in the <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}
