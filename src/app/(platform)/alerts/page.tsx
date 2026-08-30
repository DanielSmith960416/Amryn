import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { Badge, PriorityBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatRelative, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Alerts' };

/** Alerts (specification §28), newest and most severe first. */
export default async function AlertsPage() {
  const workspace = await requirePermission('view_alerts');
  const supabase = await createClient();

  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('organisation_id', workspace.organisation.id)
    .not('status', 'in', '("dismissed","resolved")')
    .order('severity', { ascending: true })
    .order('created_at', { ascending: false });

  const rows = alerts ?? [];

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Alerts"
        description="What Amryn thought was worth interrupting you for."
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing needs your attention"
            description="No metric has crossed a threshold, no sync has failed and no competitor has moved. Amryn only raises an alert when something has actually changed."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((alert) => (
              <li key={alert.id} className="flex items-start gap-4 px-5 py-4">
                <span
                  aria-hidden
                  className={
                    'mt-1.5 size-2 shrink-0 rounded-full ' +
                    (alert.severity === 'critical'
                      ? 'bg-[var(--negative)]'
                      : alert.severity === 'high'
                        ? 'bg-[var(--warning)]'
                        : alert.severity === 'medium'
                          ? 'bg-[var(--info)]'
                          : 'bg-[var(--text-tertiary)]')
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[0.9375rem] leading-snug font-medium text-[var(--text-primary)]">
                      {alert.title}
                    </p>
                    <span className="numeric text-[0.6875rem] text-[var(--text-tertiary)]">
                      {formatRelative(alert.created_at)}
                    </span>
                  </div>

                  {alert.detail ? (
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                      {alert.detail}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={alert.severity} />
                    <Badge tone="outline">{humanise(alert.source_kind)}</Badge>
                    {alert.status !== 'new' ? (
                      <Badge tone="neutral">{humanise(alert.status)}</Badge>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
