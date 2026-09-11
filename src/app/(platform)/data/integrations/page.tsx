import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { loadEntitlements } from '@/lib/billing/entitlements';
import { CONNECTORS, byCategory, type ConnectorCategory } from '@/lib/connectors/catalogue';
import { connectionsRemaining, mayConnect } from '@/lib/connectors/access';
import { connectPath } from '@/lib/connectors/native';
import type { Plan } from '@/lib/billing/access';

export const metadata: Metadata = { title: 'Integrations' };

/**
 * The systems Amryn can read, and where this organisation stands with each.
 *
 * Separate from /data, which lists the connections that exist and how healthy
 * they are. This is the other half of the question — what *could* be
 * connected — and the two are different jobs: one is operations, this is a
 * decision about what to plug in.
 *
 * Every card states its own answer rather than being hidden. A connector the
 * plan does not carry is shown with the tier that would carry it, because a
 * customer cannot decide to upgrade for something they cannot see, and a
 * catalogue that quietly omits two thirds of itself reads as a thin product
 * rather than a tiered one.
 */

const CATEGORY_TITLES: Record<ConnectorCategory, string> = {
  accounting: 'Accounting',
  payments: 'Payments',
  crm: 'Customers and pipeline',
  erp: 'Enterprise systems',
  productivity: 'Documents and spreadsheets',
  analytics: 'Analytics',
  commerce: 'Online sales',
};

/** The order the sections appear in — South African essentials first. */
const CATEGORY_ORDER: ConnectorCategory[] = [
  'accounting',
  'payments',
  'crm',
  'commerce',
  'productivity',
  'analytics',
  'erp',
];

export default async function IntegrationsPage() {
  const workspace = await requirePermission('view_data_sources');
  const supabase = await createClient();

  const [entitlements, { data: connections }, { data: subscription }] = await Promise.all([
    loadEntitlements(workspace.organisation.id),
    supabase
      .from('data_connections')
      .select('id, status, last_synced_at, data_sources(provider)')
      .eq('organisation_id', workspace.organisation.id),
    supabase
      .from('subscriptions')
      .select('plan')
      .eq('organisation_id', workspace.organisation.id)
      .maybeSingle(),
  ]);

  const used = (connections ?? []).length;
  const plan = (subscription?.plan ?? 'starter') as Plan;
  const context = { plan, entitlements, used };
  const remaining = connectionsRemaining(context);

  const grouped = byCategory();

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Integrations"
        description="The systems Amryn can read directly. Connecting one replaces a spreadsheet you would otherwise keep by hand, and everything Amryn concludes is drawn from what these bring in."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/data">What is connected</Link>
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
          <p className="text-[0.9375rem] text-[var(--text-primary)]">
            <strong className="font-semibold">
              {used} {used === 1 ? 'system' : 'systems'} connected
            </strong>
            {remaining === null ? (
              <span className="text-[var(--text-secondary)]"> — your plan has no limit.</span>
            ) : (
              <span className="text-[var(--text-secondary)]">
                {' '}
                — room for {remaining} more on your plan.
              </span>
            )}
          </p>
          <Link
            href="/settings/billing"
            className="text-[0.8125rem] text-[var(--brand)] underline-offset-2 hover:underline"
          >
            See what each tier carries
          </Link>
        </div>
      </Card>

      {/*
        Said once, at the top, rather than repeated on every card — and it used
        to say that nothing could be connected at all, which was true while
        every row was unconfirmed. One is open now, so the notice says which
        rather than continuing to claim none.
      */}
      <Card tone="warning" className="mb-5">
        <div className="px-5 py-4">
          <p className="text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
            <strong className="font-semibold">Most connections are not open yet.</strong> A system
            is switched on only once it has been checked against its provider&rsquo;s own
            documentation, which is why the cards below say where each one stands. For the rest,
            bring your figures in through{' '}
            <Link href="/data/imports" className="text-[var(--brand)] underline-offset-2 hover:underline">
              a file import
            </Link>
            , which works today and feeds the same analysis.
          </p>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.map((category) => {
          const list = grouped.get(category) ?? [];
          if (list.length === 0) return null;

          return (
            <section key={category}>
              <CardHeader
                title={CATEGORY_TITLES[category]}
                subtitle={`${list.length} ${list.length === 1 ? 'system' : 'systems'}`}
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((definition) => {
                  const decision = mayConnect(definition, context);
                  /*
                   * Keyed on the source's provider, not on data_source_id.
                   * data_source_id is the id of a data_sources row — a uuid —
                   * and comparing it to a catalogue id like 'paystack' was
                   * never going to match, so every connected system showed as
                   * unconnected. Nobody noticed because nothing could connect.
                   */
                  const connected = (connections ?? []).some(
                    (c) =>
                      (c.data_sources as { provider: string | null } | null)?.provider ===
                      definition.id,
                  );

                  return (
                    <Card key={definition.id} className="flex flex-col p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                          {definition.name}
                        </p>
                        {connected ? (
                          <Badge tone="positive">Connected</Badge>
                        ) : definition.market === 'south_africa' ? (
                          <Badge tone="info">South Africa</Badge>
                        ) : null}
                      </div>

                      <p className="mt-1.5 flex-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                        {definition.description}
                      </p>

                      <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                        {decision.allowed ? (
                          <Button asChild variant={connected ? 'secondary' : 'primary'} size="sm">
                            <Link href={connectPath(definition)}>
                              {connected ? 'Manage' : 'Connect'}
                            </Link>
                          </Button>
                        ) : (
                          <>
                            <p className="text-[0.75rem] font-medium text-[var(--text-primary)]">
                              {decision.detail}
                            </p>
                            {decision.remedy ? (
                              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
                                {decision.remedy}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-[0.75rem] text-[var(--text-tertiary)]">
        {CONNECTORS.length} systems in the catalogue. A system you use that is not listed can be
        built as a custom connector on Enterprise.
      </p>
    </>
  );
}
