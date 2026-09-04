import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { OpenPlatformLink } from './open-platform-link';
import { AIGrowthIntelligence, DigitalTwin, OpportunityRadar, TM } from '@/components/shell/tm';
import { withBasePath } from '@/lib/base-path';

/**
 * The public site's header and footer.
 *
 * The footer's legal block is carried over from the existing marketing site
 * verbatim, because it is doing real work: it states the trademarks, it says
 * the Command Centre figures are illustrative, and it draws the distinction —
 * which the previous build's architecture notes record as a deliberate
 * decision — between who Amryn sells to and what the software will surface to
 * the businesses that use it. None of that is decoration and none of it is
 * paraphrased here.
 */

const CONTACT_EMAIL = 'danielsmith960416@gmail.com';
const CONTACT_PHONE = '067 004 8810';
const CONTACT_PHONE_TEL = '+27670048810';

export function MarketingNav() {
  return (
    <header className="glass-strong sticky top-0 z-30 rounded-none border-x-0 border-t-0">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Amryn, home">
          <Image
            src={withBasePath("/brand/amryn-icon-mark.png")}
            alt=""
            width={553}
            height={563}
            className="size-6 w-auto"
            priority
          />
          <span className="font-display text-[0.9375rem] font-semibold tracking-tight">
            <TM>Amryn</TM>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Sections">
          {[
            ['#how', 'How it works'],
            ['#platform', 'The platform'],
            ['#who', 'Who it is for'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--text-secondary)] transition-colors hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Continue</Link>
          </Button>
          <OpenPlatformLink size="sm" />
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--glass-hairline)] bg-[var(--glass-inset)] backdrop-blur-[var(--glass-blur)]">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Image
              src={withBasePath("/brand/amryn-lockup-secondary.png")}
              alt="Amryn™ AIGrowthIntelligence®"
              width={746}
              height={270}
              className="w-44"
            />
            <p className="mt-3 font-label text-[0.75rem] tracking-wide text-[var(--text-secondary)] uppercase">
              Business Inside + Market Outside = Intelligent Growth
            </p>
          </div>

          <div className="flex flex-col gap-1.5 text-[0.8125rem]">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[var(--brand)] hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            <a href={`tel:${CONTACT_PHONE_TEL}`} className="text-[var(--brand)] hover:underline">
              {CONTACT_PHONE}
            </a>
            <span className="text-[var(--text-secondary)]">South Africa</span>
          </div>
        </div>

        <div className="mt-10 space-y-3 border-t border-[var(--border)] pt-6 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          <p>
            <TM>Amryn</TM> <AIGrowthIntelligence />, <TM>Amryn</TM>
            <DigitalTwin /> and <TM>Amryn</TM>
            <OpportunityRadar /> are trademarks of Amryn. © 2026 Amryn. All rights reserved.
          </p>
          <p>
            All figures shown in the Command Centre and the demonstration workspace are an
            illustrative demonstration, not real client data.
          </p>
          <p>
            Amryn trades with private-sector businesses and does not take on government-sector work
            itself. This is a statement about Amryn&rsquo;s own clients, not a limit on the
            software: the <OpportunityRadar /> surfaces tenders and public-sector opportunities to
            the businesses that use it, and each of them sets its own sector scope.
          </p>
        </div>
      </div>
    </footer>
  );
}
