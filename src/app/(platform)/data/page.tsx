import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatRelative, humanise } from '@/lib/utils/format';
import type { Enums } from '@/types/database';

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
          <Button asChild variant="primary" size="sm">
            <Link href="/data/imports">Import a file</Link>
          </Button>
        }
      />

      {failing.length > 0 ? (
        <Card tone="negative" className="mb-5">
          <div className="px-5 py-4">
            <p className="text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
              <strong>
                {failing.length} {failing.length === 1 ? 'connection is' : 'connections are'} failing.
              </strong>{' '}
              Anything Amryn concludes from{' '}
              {failing
                .map((row) => (row.data_sources as unknown as { name: string }).name)
                .join(', ')}{' '}
              is working from stale figures until this is fixed.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Connections" subtitle={`${rows.length} configured`} />
        {rows.length === 0 ? (
          <EmptyState
            title="No data connected yet"
            description="Connect your first data source to allow your AI DigitalTwin® to begin learning about your business."
            action={
              <Button asChild variant="primary">
                <Link href="/data/imports">Import a spreadsheet</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {rows.map((row) => {
              const source = row.data_sources as unknown as {
                name: string;
                category: Enums['data_source_category'];
                provider: string | null;
                description: string | null;
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
