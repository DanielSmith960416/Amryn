import Image from 'next/image';
import Link from 'next/link';
import { currentUser } from '@/lib/auth/current-user';
import { Button } from '@/components/ui/button';
import { MarketingFooter, MarketingNav } from '@/components/marketing/chrome';
import { AIGrowthIntelligence, DigitalTwin, OpportunityRadar, TM } from '@/components/shell/tm';

/**
 * The public homepage.
 *
 * This continues the marketing site at danielsmith960416.github.io/Amryn: the
 * same positioning, the same headline, the same "Business Inside + Market
 * Outside = Intelligent Growth" philosophy line, the same contact details and
 * the same trademark handling. What changes is the ending — the old site's only
 * call to action was an email; this one opens the platform.
 */

const CONTACT_EMAIL = 'danielsmith960416@gmail.com';

const ASSESSMENT_MAILTO =
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Amryn Intelligence Assessment')}` +
  `&body=${encodeURIComponent("I'd like to book an Amryn Intelligence Assessment.")}`;

export default async function HomePage() {
  const user = await currentUser();

  return (
    <>
      <MarketingNav signedIn={Boolean(user)} />

      <main id="top">
        {/* ── Positioning ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-5 pt-14 pb-12 sm:px-8 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.35fr_1fr]">
            <div>
              <p className="eyebrow">
                <TM>Amryn</TM> <AIGrowthIntelligence /> Software
              </p>
              <h1 className="font-display mt-3 text-[2.25rem] leading-[1.08] font-extrabold tracking-tight text-[var(--text-primary)] sm:text-[3.25rem]">
                See Your Business.
                <br />
                See Your Market.
                <br />
                <em className="text-[var(--brand)] not-italic">Know What To Do Next.</em>
              </h1>
              <p className="mt-5 max-w-xl text-[1rem] leading-relaxed text-[var(--text-secondary)]">
                <TM>Amryn</TM> combines AI-powered business intelligence, a continuously evolving{' '}
                <TM>Amryn</TM>
                <DigitalTwin /> and external <TM>Amryn</TM>
                <OpportunityRadar /> intelligence to help management understand what is happening,
                identify what matters and act faster.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild variant="primary" size="lg">
                  <Link href={user ? '/command-centre' : '/sign-up'}>
                    {user ? 'Open the platform' : 'Open the platform'}
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <a href={ASSESSMENT_MAILTO}>Book an Intelligence Assessment</a>
                </Button>
              </div>
            </div>

            <div className="hidden justify-self-center lg:block" aria-hidden>
              <Image
                src="/brand/amryn-icon-mark.png"
                alt=""
                width={553}
                height={563}
                className="w-56 opacity-90 dark:hidden"
                priority
              />
              <Image
                src="/brand/amryn-icon-mark-white.png"
                alt=""
                width={553}
                height={563}
                className="hidden w-56 opacity-90 dark:block"
                priority
              />
            </div>
          </div>

          <p className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] pt-6 font-mono text-[0.8125rem] tracking-wide text-[var(--text-secondary)] uppercase">
            <span>Business Inside</span>
            <i className="text-[var(--brand)] not-italic">+</i>
            <span>Market Outside</span>
            <i className="text-[var(--brand)] not-italic">=</i>
            <b className="font-semibold text-[var(--text-primary)]">Intelligent Growth</b>
          </p>
        </section>

        {/* ── What you get ────────────────────────────────────────────── */}
        <section id="how" className="border-y border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <p className="eyebrow">How it works</p>
            <h2 className="font-display mt-2 max-w-2xl text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)] sm:text-[2.125rem]">
              Two views of the same business, one decision surface.
            </h2>

            <div className="mt-9 grid gap-6 md:grid-cols-3">
              {[
                {
                  title: (
                    <>
                      <TM>Amryn</TM>
                      <DigitalTwin />
                    </>
                  ),
                  body:
                    'A continuously updated representation of the business, built from connected ' +
                    'internal data — finance, sales, operations, people. It explains what is ' +
                    'happening and why.',
                },
                {
                  title: (
                    <>
                      <TM>Amryn</TM>
                      <OpportunityRadar />
                    </>
                  ),
                  body:
                    'Continuous external intelligence: tenders, demand shifts, competitor moves, ' +
                    'pricing signals and market openings — scored and prioritised against your ' +
                    'own capacity.',
                },
                {
                  title: <>Executive Command Centre</>,
                  body:
                    'Both views converge into one interface built for decision-makers: what ' +
                    'matters, why it matters, what to do next, and what happened when you did it.',
                },
              ].map((col, i) => (
                <article key={i}>
                  <h3 className="font-display text-[1.0625rem] font-semibold text-[var(--text-primary)]">
                    {col.title}
                  </h3>
                  <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                    {col.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── What is inside the platform ─────────────────────────────── */}
        <section id="platform" className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <p className="eyebrow">Inside the platform</p>
          <h2 className="font-display mt-2 max-w-2xl text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)] sm:text-[2.125rem]">
            Sign in and the whole intelligence loop is already running.
          </h2>
          <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            No dashboard to build and no software to install. The same layer that scores your
            business drafts the formal weekly executive report you receive in PDF.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Executive Command Centre', 'What matters this week, why, and who owns it.'],
              ['DigitalTwin® + Business Health', 'Eight weighted components, scored and explained.'],
              ['OpportunityRadar®', 'Growth openings ranked on value, fit, urgency and effort.'],
              ['Risk Radar & Register', 'Probability × impact, with owners and mitigation dates.'],
              ['Action Centre', 'Every recommendation carries an owner and an expected result.'],
              [
                'Advanced Inventory Control',
                'Expiry compliance, audit log, department matrix and the stock intelligence report your insurer asks for.',
              ],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-card)]"
              >
                <h3 className="font-display text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                  {title}
                </h3>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Who it is for ───────────────────────────────────────────── */}
        <section id="who" className="border-y border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <p className="eyebrow">Who it is for</p>
            <h2 className="font-display mt-2 text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)] sm:text-[2.125rem]">
              Any business building a growth engine.
            </h2>
            <p className="mt-3 max-w-3xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
              <TM>Amryn</TM> is not sized to a company, it is sized to a decision. Wherever
              management complexity is high and data is accessible — a single high-performing site,
              a multi-branch group, or a national operation — the same intelligence loop applies.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [
                  'Owner-led business',
                  'One decision-maker holding everything. Amryn gives back the reporting hours and flags what would otherwise be missed.',
                ],
                [
                  'Growing company',
                  'Enough moving parts that no one sees the whole picture. Amryn keeps the internal and external views in one place.',
                ],
                [
                  'Multi-branch group',
                  'Regional, branch and store managers working from the same intelligence, with visibility across every site.',
                ],
                [
                  'Enterprise operation',
                  'Custom integrations, governance and role-based access, with the intelligence loop running across business units.',
                ],
              ].map(([k, v]) => (
                <article key={k}>
                  <p className="font-mono text-[0.6875rem] font-medium tracking-wide text-[var(--brand)] uppercase">
                    {k}
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {v}
                  </p>
                </article>
              ))}
            </div>

            <p className="mt-8 text-[0.8125rem] text-[var(--text-tertiary)]">
              Built for CEOs, executives, regional managers, branch managers and store managers.
            </p>
          </div>
        </section>

        {/* ── Call to action ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8">
          <Image
            src="/brand/amryn-icon-mark.png"
            alt=""
            width={553}
            height={563}
            className="mx-auto w-14 dark:hidden"
          />
          <Image
            src="/brand/amryn-icon-mark-white.png"
            alt=""
            width={553}
            height={563}
            className="mx-auto hidden w-14 dark:block"
          />
          <h2 className="font-display mt-5 text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)] sm:text-[2.125rem]">
            See it running on your own numbers.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            An Intelligence Assessment maps your internal data and external signals, and returns a
            working Command Centre view of your business. No dashboard to learn, no software to
            install.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href={user ? '/command-centre' : '/sign-up'}>Open the platform</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href={ASSESSMENT_MAILTO}>Book an Intelligence Assessment</a>
            </Button>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
