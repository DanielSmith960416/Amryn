import type { Metadata } from 'next';
import { MetricView } from '@/features/performance/metric-view';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';

export const metadata: Metadata = { title: 'Financial Performance' };

export default async function FinancialPerformancePage() {
  const workspace = await requirePermission('view_financial_data');
  const context = await buildBusinessContext(workspace);

  return (
    <MetricView
      context={context}
      metrics={context.metrics.filter((metric) => metric.category === 'financial')}
      title="Financial Performance"
      description="Revenue, margin and cost — what the business earned, and what it spent earning it."
      emptyDescription="No financial metric has been defined against a connected source yet. Connect an accounting system, or define a metric with a target, and this page fills itself."
    />
  );
}
