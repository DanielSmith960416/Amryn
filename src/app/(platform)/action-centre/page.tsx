import type { Metadata } from 'next';
import { Badge, PRIORITY_TONE } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Stat, StatGrid } from '@/components/ui/stat';
import { EmptyRow, Table, TableWrap, Td, Th } from '@/components/ui/table';
import { count, date, percent } from '@/lib/format';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Action Centre' };

const STATUS_TONE = {
  Completed: 'positive',
  'In Progress': 'info',
  Planning: 'warning',
  'Not Started': 'neutral',
} as const;

/**
 * ACTION_CENTRE — "Every Action Has an Owner", as the prototype titles it.
 *
 * The source column is doing real work and is kept: an action that traces back
 * to RSK-002 or OPP-004 can be closed by asking whether that risk or
 * opportunity moved, which an action with no provenance cannot.
 */
export default function ActionCentrePage() {
  const w = loadWorkspace();
  const s = w.actionSummary;

  return (
    <>
      <PageHeader
        eyebrow="Act"
        title="Action Centre"
        description="Every recommendation carries an owner, a due date and the outcome it protects or unlocks."
      />

      {w.isDemo ? <DemoNotice /> : null}

      <StatGrid className="mb-6">
        <Stat label="Total" value={count(s.total)} />
        <Stat label="In progress" value={count(s.inProgress)} tone="brand" />
        <Stat label="Planning" value={count(s.planning)} />
        <Stat label="Not started" value={count(s.notStarted)} tone="warning" />
        <Stat label="Completed" value={count(s.completed)} tone="positive" />
        <Stat
          label="Completion rate"
          value={percent(s.completionRate, 0)}
          sub="Target 80%"
          tone={s.completionRate >= 0.8 ? 'positive' : 'warning'}
        />
      </StatGrid>

      <div
        className="mb-6 h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--card-inset)]"
        role="img"
        aria-label={`${percent(s.completionRate, 0)} of actions complete`}
      >
        <div
          className="h-full rounded-[var(--radius-pill)] bg-[var(--brand)]"
          style={{ width: `${Math.round(s.completionRate * 100)}%` }}
        />
      </div>

      <Card>
        <CardHeader
          title="Action register"
          subtitle="Open work first, ordered by due date; completed work last"
        />
        <TableWrap className="rounded-t-none border-0 border-t">
          <Table>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Action</Th>
                <Th>Source</Th>
                <Th>Priority</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th>Expected result</Th>
                <Th numeric>Complete</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {w.actions.map((a) => (
                <tr key={a.id}>
                  <Td className="numeric whitespace-nowrap">{a.id}</Td>
                  <Td className="min-w-[14rem] font-medium">{a.action}</Td>
                  <Td className="whitespace-nowrap">{a.source}</Td>
                  <Td>
                    <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{a.owner}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{date(a.dueDate)}</Td>
                  <Td className="min-w-[12rem]">{a.expectedResult}</Td>
                  <Td numeric>{percent(a.completion, 0)}</Td>
                  <Td className="min-w-[12rem] text-[var(--text-secondary)]">{a.notes}</Td>
                </tr>
              ))}
              {w.actions.length === 0 ? (
                <EmptyRow colSpan={10}>No actions are open.</EmptyRow>
              ) : null}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}
