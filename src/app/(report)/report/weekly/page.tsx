import type { Metadata } from 'next';
import { ReportDocument } from '@/features/reports/document';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Weekly Intelligence Brief' };

export default function WeeklyReportPage() {
  const workspace = loadWorkspace();
  return <ReportDocument workspace={workspace} brief={workspace.weekly} />;
}
