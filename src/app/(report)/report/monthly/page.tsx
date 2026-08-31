import type { Metadata } from 'next';
import { ReportDocument } from '@/features/reports/document';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Monthly Intelligence Report' };

export default function MonthlyReportPage() {
  const workspace = loadWorkspace();
  return <ReportDocument workspace={workspace} brief={workspace.monthly} />;
}
