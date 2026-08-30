import type { Metadata } from 'next';
import { MetricView } from '@/features/performance/metric-view';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';

export const metadata: Metadata = { title: 'Sales Performance' };

export default async function SalesPerformancePage() {
  const workspace = await requirePermission('view_sales_data');
  const context = await buildBusinessContext(workspace);

  return (
    <MetricView
      context={context}
      metrics={context.metrics.filter(
        (metric) => metric.category === 'sales' || metric.category === 'customer',
      )}
      title="Sales Performance"
      description="Orders, order value and what customers are actually buying."
      emptyDescription="No sales or customer metric has been defined against a connected source yet. Connect a POS or CRM to populate this."
    />
  );
}
