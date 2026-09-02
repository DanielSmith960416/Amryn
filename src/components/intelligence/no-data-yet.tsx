import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/card';

/**
 * What a screen shows before any figures have arrived.
 *
 * The product's previous answer to this was the demonstration business —
 * another company's revenue, margins and branches, on the customer's Command
 * Centre, indistinguishable from their own but for a small banner. The second
 * available wrong answer is computed zeros, which is worse in a different way:
 * the health engine would score them and report CRITICAL as a finding.
 *
 * So the screen says what is missing and where to fix it, and claims to have
 * measured nothing.
 */
export function NoDataYet({
  what,
  organisationName,
  detail,
  action,
}: {
  /** The thing this screen would show, in the customer's words. */
  what: string;
  organisationName?: string;
  detail?: string;
  /**
   * Where the fix actually is, when it is not the data-sources page. An empty
   * state that sends somebody to the wrong screen is worse than one with no
   * button: they follow it, find nothing to do, and conclude the product is
   * broken rather than empty.
   */
  action?: { href: string; label: string };
}) {
  return (
    <Card>
      <CardBody className="py-10 text-center">
        <p className="text-[1.0625rem] font-semibold text-[var(--text-primary)]">
          Nothing to show here yet
        </p>
        <p className="mx-auto mt-2 max-w-md text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
          {what} appears once {organisationName ? `${organisationName}’s` : 'your'} figures reach
          the platform. {detail ?? 'Connect a system or import a spreadsheet and this fills in.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href={action?.href ?? '/data'}
            className="inline-flex h-9 items-center rounded-[var(--radius-field)] bg-[var(--brand)] px-4 text-[0.8125rem] font-medium text-[var(--on-brand)]"
          >
            {action?.label ?? 'Connect your data'}
          </Link>
          <Link
            href="/onboarding/identity"
            className="inline-flex h-9 items-center rounded-[var(--radius-field)] border border-[var(--border-strong)] px-4 text-[0.8125rem] font-medium text-[var(--text-primary)]"
          >
            Review your setup
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
