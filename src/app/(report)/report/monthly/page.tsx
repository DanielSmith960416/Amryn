import type { Metadata } from 'next';
import { ReportDocument } from '@/features/reports/document';
import { currentWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Monthly Intelligence Report' };

export default async function MonthlyReportPage() {
  const state = await currentWorkspace();
  const workspace =
    state.kind === 'empty' ? null : state.workspace;
  if (!workspace) {
    // A brief about a business with no figures would be a page of
    // zeros with a letterhead. Better to say so.
    return (
      <main style={{ padding: '3rem', fontFamily: 'system-ui' }}>
        <h1>Not enough data yet</h1>
        <p>
          This brief is written from your own figures, and none have reached the platform yet.
          Connect a system or import a spreadsheet and it will be here next week.
        </p>
      </main>
    );
  }
  return <ReportDocument workspace={workspace} brief={workspace.monthly} />;
}
