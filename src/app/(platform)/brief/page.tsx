import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireWorkspace } from '@/lib/auth/session';
import { SECTION_LABEL, type Section } from '@/features/brief/compose';
import { briefEnabled, briefFor, recentBriefs, type StoredItem } from '@/features/brief/record';
import { money } from '@/lib/format';

export const metadata: Metadata = { title: 'Morning brief' };

/**
 * The Daily Intelligence Brief.
 *
 * At most five things, ranked, each naming the record it came from. The
 * citation is on the page rather than behind a hover or a details panel: a
 * figure whose source takes a click to find is a figure most people will quote
 * without ever having looked.
 *
 * This does not replace the executive summary on the Command Centre. That one
 * is computed live from the workspace as it stands right now; this is a dated,
 * stored record of what was true on a particular morning, with a delivery
 * guarantee. Different lifecycles, and merging them would mean losing whichever
 * property the merged one did not keep.
 */
export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const workspace = await requireWorkspace();
  const { date } = await searchParams;
  const org = workspace.organisation.id;

  const [enabled, brief, recent] = await Promise.all([
    briefEnabled(org),
    briefFor(org, date),
    recentBriefs(org),
  ]);

  const currency = workspace.organisation.currency_code ?? 'ZAR';

  return (
    <>
      <PageHeader
        eyebrow="Every morning"
        title="Morning brief"
        description="The five things worth your attention, ranked by what they are worth. Every line names the record it came from."
        actions={brief ? <Delivery brief={brief} /> : null}
      />

      {enabled ? null : <NotSwitchedOn />}

      {recent.length > 1 ? <Mornings recent={recent} current={brief?.briefDate} /> : null}

      {brief ? (
        <>
          <div className="space-y-4">
            {brief.items.map((item) => (
              <Item key={item.id} item={item} currency={currency} />
            ))}
          </div>

          {brief.items.length === 0 ? (
            <Card>
              <CardBody className="pt-5">
                <p className="text-[0.875rem] text-[var(--text-primary)]">
                  Nothing needed your attention on {brief.briefDate}.
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  That is a finding rather than a gap — every section below was looked at.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {brief.empty.length > 0 ? <LookedAt empty={brief.empty} /> : null}
        </>
      ) : (
        <NoBriefYet enabled={enabled} />
      )}
    </>
  );
}

/* ── one line of the brief ─────────────────────────────────────────────── */

const PROVENANCE_TONE = {
  fact: 'info',
  derived: 'info',
  estimated: 'warning',
  simulated: 'warning',
} as const;

const PROVENANCE_LABEL = {
  fact: 'Recorded',
  derived: 'Calculated from your figures',
  estimated: 'Estimated',
  simulated: 'From the Twin',
} as const;

function Item({ item, currency }: { item: StoredItem; currency: string }) {
  return (
    <Card>
      <CardHeader
        eyebrow={`${item.rank}. ${SECTION_LABEL[item.section]}`}
        title={item.headline}
        actions={
          item.impactCents === null ? null : (
            <span className="numeric text-[0.875rem] font-medium text-[var(--text-primary)]">
              {money(item.impactCents / 100, currency)}
            </span>
          )
        }
      />
      <CardBody>
        <p className="text-[0.875rem] leading-relaxed text-[var(--text-primary)]">{item.detail}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
          <Badge tone={PROVENANCE_TONE[item.provenance]}>{PROVENANCE_LABEL[item.provenance]}</Badge>
          {/*
            The citation, in full, on the page, and now something you can
            follow. Not a tooltip: a source you have to hover to see is a source
            most readers will never look at, and an unread citation is the same
            as none. A citation you cannot follow is not much better — printing
            a row id was proof the line had a source, not a way to go and read
            it.
          */}
          <Link
            href={`/explain/brief_items/${item.id}`}
            className="text-[0.75rem] font-medium text-[var(--brand)] hover:underline"
          >
            Where did this come from?
          </Link>
          <span className="numeric text-[0.6875rem] text-[var(--text-tertiary)]">
            {item.sourceTable} · {item.sourceId}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

/* ── the rest of the page ──────────────────────────────────────────────── */

function Delivery({ brief }: { brief: { emailedAt: string | null; emailSkipped: string | null } }) {
  if (brief.emailedAt) return <Badge tone="positive">Emailed</Badge>;
  if (brief.emailSkipped) return <Badge tone="outline">In-app only</Badge>;
  return null;
}

function Mornings({
  recent,
  current,
}: {
  recent: { briefDate: string; itemCount: number }[];
  current?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-1.5">
      {recent.map((morning) => {
        const active = morning.briefDate === current;
        return (
          <Link
            key={morning.briefDate}
            href={`/brief?date=${morning.briefDate}`}
            className={
              'numeric rounded-[var(--radius-field)] border px-2.5 py-1 text-[0.75rem] transition-colors ' +
              (active
                ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--card-inset)]')
            }
          >
            {morning.briefDate}
            <span className="ml-1.5 text-[var(--text-tertiary)]">{morning.itemCount}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * What ran and found nothing.
 *
 * The reason a short brief needs this is that a reader cannot otherwise tell a
 * quiet morning from a broken job, and they will assume the second exactly
 * when the product can least afford it.
 */
function LookedAt({ empty }: { empty: { section: Section; reason: string }[] }) {
  return (
    <Card className="mt-5">
      <CardHeader
        title="Looked at, and found nothing"
        subtitle="So that a quiet morning and an unfinished one do not look the same"
      />
      <CardBody>
        <dl className="space-y-2.5">
          {empty.map((section) => (
            <div key={section.section}>
              <dt className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
                {SECTION_LABEL[section.section]}
              </dt>
              <dd className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                {section.reason}
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

function NotSwitchedOn() {
  return (
    <Card tone="warning" className="mb-5">
      <CardBody className="pt-5">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
          The morning brief is not switched on for this organisation yet.
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          Nothing is composed until we turn it on for you. It is enabled one organisation at a time,
          deliberately — a brief arriving every morning for a business nobody has read it with is
          how a product teaches people to ignore it.
        </p>
      </CardBody>
    </Card>
  );
}

function NoBriefYet({ enabled }: { enabled: boolean }) {
  return (
    <Card>
      <CardBody className="pt-5">
        <p className="text-[0.875rem] text-[var(--text-primary)]">No brief has been composed yet.</p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          {enabled
            ? 'The first one arrives tomorrow morning. Briefs are composed at half past five, after the Twin has run its night.'
            : 'One will be composed each morning once the brief is switched on for you.'}
        </p>
      </CardBody>
    </Card>
  );
}
