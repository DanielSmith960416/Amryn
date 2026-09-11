import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { loadEntitlements } from '@/lib/billing/entitlements';
import { connector } from '@/lib/connectors/catalogue';
import { mayConnect } from '@/lib/connectors/access';
import { authorisingProvider } from '@/lib/connectors/native';
import { authorisedByKey } from '@/lib/connectors/provider';
import { KeyForm } from '@/features/connectors/key-form';
import { disconnectSystem } from '@/features/connectors/connect';
import type { Plan } from '@/lib/billing/access';

export const metadata: Metadata = { title: 'Connect a system', robots: { index: false } };

/**
 * Connecting one system, and the page that says what that actually means.
 *
 * Separate from the catalogue page because the decision and the act are
 * different moments: one is "what could we plug in", this is "here is my key".
 * Putting a credential field on a grid of twenty cards would be the wrong
 * shape for both.
 *
 * Every reason this page might refuse is shown as a sentence rather than as a
 * missing button. A connector the plan does not carry, a quota already spent,
 * an implementation that does not exist yet — each has a different remedy, and
 * access.ts already chose the words for all of them.
 */
export default async function ConnectPage({
  params,
}: {
  params: Promise<{ connector: string }>;
}) {
  const { connector: id } = await params;
  const definition = connector(id);
  if (!definition) notFound();

  const workspace = await requirePermission('manage_integrations');
  const supabase = await createClient();

  const [entitlements, { data: connections }, { data: subscription }] = await Promise.all([
    loadEntitlements(workspace.organisation.id),
    supabase
      .from('data_connections')
      .select('id, status, config, last_synced_at, data_sources(provider)')
      .eq('organisation_id', workspace.organisation.id),
    supabase
      .from('subscriptions')
      .select('plan')
      .eq('organisation_id', workspace.organisation.id)
      .maybeSingle(),
  ]);

  const all = connections ?? [];
  const existing = all.find(
    (row) => (row.data_sources as { provider: string | null } | null)?.provider === definition.id,
  );

  const decision = mayConnect(definition, {
    plan: (subscription?.plan ?? 'starter') as Plan,
    entitlements,
    used: all.length,
  });

  const provider = authorisingProvider(definition);
  const byKey = provider !== null && authorisedByKey(provider);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title={definition.name}
        description={definition.description}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/data/integrations">All systems</Link>
          </Button>
        }
      />

      {existing ? (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                {label(existing.config) ?? definition.name} is connected.
                <Badge tone="positive" className="ml-2">
                  {existing.status}
                </Badge>
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                {existing.last_synced_at
                  ? `Last read ${new Date(existing.last_synced_at).toLocaleString('en-ZA')}.`
                  : 'Nothing has been read from it yet.'}
              </p>
            </div>

            <form action={disconnectSystem}>
              <input type="hidden" name="connection" value={existing.id} />
              <Button type="submit" variant="secondary" size="sm">
                Disconnect
              </Button>
            </form>
          </div>

          {/*
            Said plainly, because the alternative is somebody assuming their
            key is dead when it is not. Amryn can delete its own copy and
            nothing more — retiring a key is done where it was issued.
          */}
          <div className="border-t border-[var(--border-subtle)] px-5 py-3">
            <p className="text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
              Disconnecting deletes Amryn&rsquo;s copy of your key and stops it reading anything
              further. It cannot retire the key itself — only you can do that, in your{' '}
              {definition.name} dashboard. Figures already brought in stay where they are.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={existing ? 'Replace the key' : 'Connect'}
          subtitle={
            definition.auth === 'api_key'
              ? 'Authorised with a key you paste in, rather than a sign-in redirect.'
              : undefined
          }
        />

        <div className="px-5 pb-5 pt-1">
          {!decision.allowed ? (
            <>
              <p className="text-[0.875rem] text-[var(--text-primary)]">{decision.detail}</p>
              {decision.remedy ? (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {decision.remedy}
                </p>
              ) : null}
            </>
          ) : !byKey ? (
            <p className="text-[0.875rem] leading-relaxed text-[var(--text-primary)]">
              {definition.name} is authorised a different way, and that flow is not built yet.
            </p>
          ) : (
            <KeyForm
              connectorId={definition.id}
              connectorName={definition.name}
              helpUrl={definition.capabilitiesSource ?? '/data/integrations'}
            />
          )}
        </div>
      </Card>

      {/*
        Where the key goes, in the customer's own interest rather than as
        reassurance. Somebody handing over a credential that can move their
        money is entitled to know who can read it back, and the answer is
        unusual enough to be worth stating: nobody who can open a page.
      */}
      <Card className="mt-5">
        <CardHeader title="What happens to your key" />
        <div className="space-y-2 px-5 pb-5 pt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          <p>
            It is checked against {definition.name} before anything is saved, so a mistyped key
            never becomes a half-made connection.
          </p>
          <p>
            It is then stored encrypted, outside the tables that hold your business data, and it is
            reachable only by the process that runs your syncs. This page cannot read it back.
            Neither can anybody signed in to Amryn, including you and including us.
          </p>
          <p>
            Amryn only ever reads from {definition.name}. Nothing it does can move money, issue a
            refund or change a record on your account.
          </p>
        </div>
      </Card>
    </>
  );
}

/** The label the connection was created with, where it still looks like one. */
function label(config: unknown): string | null {
  if (config && typeof config === 'object' && 'label' in config) {
    const value = (config as { label: unknown }).label;
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}
