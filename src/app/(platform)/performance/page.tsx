import type { Metadata } from 'next';
import { MetricView } from '@/features/performance/metric-view';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';

export const metadata: Metadata = { title: 'Business Overview' };

export default async function BusinessOverviewPage() {
  const workspace = await requirePermission('view_performance');
  const context = await buildBusinessContext(workspace);

  return (
    <MetricView
      context={context}
      metrics={context.metrics}
      title="Business Overview"
      description="Every metric Amryn is tracking, and what each has done over the periods it has history for."
      emptyDescription="No metrics are defined yet. Connect a data source and Amryn will begin building the picture."
    />
  );
}
