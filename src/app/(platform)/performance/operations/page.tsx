import type { Metadata } from 'next';
import { MetricView } from '@/features/performance/metric-view';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';

export const metadata: Metadata = { title: 'Operations' };

export default async function OperationsPerformancePage() {
  const workspace = await requirePermission('view_operations_data');
  const context = await buildBusinessContext(workspace);

  return (
    <MetricView
      context={context}
      metrics={context.metrics.filter((metric) => metric.category === 'operational')}
      title="Operations"
      description="Delivery, stock and the measures that decide whether the promise is kept."
      emptyDescription="No operational metric has been defined against a connected source yet. Connect an ERP or inventory system to populate this."
    />
  );
}
