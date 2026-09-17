import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { can, requirePermission } from '@/lib/auth/session';
import { ImportForm } from '@/features/data/import-form';
import { createClient } from '@/lib/supabase/server';
import { formatRelative, humanise } from '@/lib/utils/format';
import type { Enums } from '@/types/database';
import { SectionTabs } from '@/components/ui/section-tabs';
import { visibleTabs } from '@/components/shell/navigation';

export const metadata: Metadata = { title: 'Connected Sources' };

const STATUS_TONE: Record<Enums['connection_status'], 'positive' | 'negative' | 'warning' | 'neutral' | 'info'> = {
  connected: 'positive',
  syncing: 'info',
  pending: 'warning',
  error: 'negative',
  disabled: 'neutral',
};

/** Data connections (specification §23), with failures stated first. */
export default async function DataSourcesPage() {
  const workspace = await requirePermission('view_data_sources');
  const supabase = await createClient();

  const { data: connections } = await supabase
    .from('data_connections')
    .select('*, data_sources!inner(name, category, provider, description)')
    .eq('organisation_id', workspace.organisation.id)
    .order('status');

  const rows = connections ?? [];
  const failing = rows.filter((row) => row.status === 'error');

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Connected Sources"
        description="Where Amryn's picture of your business comes from. A source that has stopped syncing quietly degrades every finding drawn from it, so failures are stated first."
        actions={
          /* "Keep a file" rather than "Upload a file": this leads to the file
             store, which files a document and reads what it can out of it. The
             way to put figures on a dashboard is the workbook importer below,
             and one button calling itself the generic name for both was how
             somebody reached the wrong one. */
          <Button asChild variant="secondary" size="sm">
            <Link href="/data/imports">Keep a file</Link>
          </Button>
        }
      />
      <SectionTabs tabs={visibleTabs('data', workspace.permissions)} />


      {failing.length > 0 ? (
        <Card tone="negative" className="mb-5">
          <div className="px-5 py-4">
            <p className="text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
              <strong>
                {failing.length} {failing.length === 1 ? 'connection is' : 'connections are'} failing.
              </strong>{' '}
              Anything Amryn concludes from{' '}
              {failing
                .map((row) => (row.data_sources as unknown as { name: string } | null)?.name ?? 'Unnamed source')
                .join(', ')}{' '}
              is working from stale figures until this is fixed.
            </p>
          </div>
        </Card>
      ) : null}

      {/*
        Above the connections, because it is the way in that needs no setting
        up. A business that has not connected anything yet can still put six
        months of its own figures into Amryn from the workbook it already
        keeps, and that is the difference between an empty product and a
        useful one on the first afternoon.

        Shown only to somebody who may actually do it: rendering a form that
        refuses on submit is a worse answer than not offering it.

        import_data, which is what the action asks for and what every policy on
        data_imports is written against. It used to read manage_integrations,
        which is a different permission held by different people: an executive
        and an analyst both hold import_data and neither holds that one, so the
        two roles whose work this is were not offered the importer at all,
        while the check that actually governs it would have let them through.
        A gate that disagrees with the lock is worse than no gate.
      */}
      {can(workspace, 'import_data') ? (
        <Card className="mb-5">
          <CardHeader
            title="Import a workbook"
            subtitle="Monthly figures, sales, expenses, opportunities and risks from a spreadsheet"
          />
          <div className="px-5 pb-5">
            <ImportForm />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Connections" subtitle={`${rows.length} configured`} />
        {rows.length === 0 ? (
          /*
            This used to read "upload what you already have — a spreadsheet, a
            PDF, a statement" above a button to the file store, which keeps a
            spreadsheet as a file and puts none of it on a dashboard. The
            sentence promised the one thing the button did not do, and it was
            the most prominent control on the page of a business that had
            connected nothing — which is precisely the business whose figures
            are not on screen yet.

            The two routes are now named by what they produce rather than both
            called "upload a file".
          */
          <EmptyState
            title="No data connected yet"
            description="Connect a system, or import the workbook you already keep — that is what puts your own figures behind the Command Centre and the financial screens. Files of other kinds, like a PDF or a statement, can be kept and read separately."
            action={
              <Button asChild variant="secondary">
                <Link href="/data/imports">Keep a file</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {rows.map((row) => {
              const source = (row.data_sources as unknown as {
                name: string;
                category: Enums['data_source_category'];
                provider: string | null;
                description: string | null;
              } | null) ?? {
                name: 'Unnamed source',
                category: 'manual' as Enums['data_source_category'],
                provider: null,
                description: null,
              };
              return (
                <li key={row.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">
                        {source.name}
                      </p>
                      <Badge tone={STATUS_TONE[row.status]}>{humanise(row.status)}</Badge>
                      <Badge tone="outline">{humanise(source.category)}</Badge>
                    </div>

                    {source.description ? (
                      <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
                        {source.description}
                      </p>
                    ) : null}

                    {row.last_error ? (
                      <p className="mt-1.5 text-[0.8125rem] text-[var(--negative)]">
                        {row.last_error}
                        {row.consecutive_errors > 1
                          ? ` (${row.consecutive_errors} consecutive failures)`
                          : ''}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="eyebrow !mb-0 !text-[0.5625rem]">Last sync</p>
                    <p className="text-[0.8125rem] text-[var(--text-secondary)]">
                      {row.last_synced_at ? formatRelative(row.last_synced_at) : 'Never'}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-[var(--text-tertiary)]">
                      {humanise(row.sync_schedule)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
