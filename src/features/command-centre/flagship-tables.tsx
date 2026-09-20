'use client';

import Link from 'next/link';
import { Badge, OPPORTUNITY_TONE, RISK_TONE } from '@/components/ui/badge';
import { SortableTable, type Column } from '@/components/intelligence/sortable-table';
import { compactMoney, date, score } from '@/lib/format';
import type { ScoredOpportunity, ScoredRisk } from '@/lib/intelligence/types';

/**
 * The two flagship registers, as tables somebody can actually interrogate.
 *
 * ── why these are client components and the page is not ───────────────────
 * SortableTable takes a `render` function per column. A function cannot cross
 * the server-to-client boundary — React has nothing to serialise it into — so
 * the columns have to be declared on the client side of the line. These two
 * files' whole job is to be that side: they take rows and a currency code,
 * both plain data, and own the column definitions.
 *
 * The alternative, passing a description of the columns as data and building
 * the renderers generically, trades a clear list of what each column shows
 * for a small interpreter. It is the kind of indirection that is cheaper to
 * write once and dearer to read for years.
 */

/* ── OpportunityRadar® ──────────────────────────────────────────────────── */

export function OpportunityTable({
  opportunities,
  currency,
}: {
  opportunities: ScoredOpportunity[];
  currency: string;
}) {
  const columns: Column<ScoredOpportunity>[] = [
    {
      key: 'title',
      header: 'Opportunity',
      sortBy: (o) => o.title,
      render: (o) => (
        <div className="min-w-0">
          <Link
            href={`/opportunity-radar#opportunity-${o.id}`}
            className="block truncate font-medium text-[var(--text-primary)] hover:text-[var(--brand)] hover:underline"
          >
            {o.title}
          </Link>
          <p className="numeric mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
            {o.id} · {o.category}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Stage',
      sortBy: (o) => o.status,
      secondary: true,
      render: (o) => <span className="text-[var(--text-secondary)]">{o.status}</span>,
    },
    {
      key: 'value',
      header: 'Est. value',
      numeric: true,
      sortBy: (o) => o.estValue,
      render: (o) => compactMoney(o.estValue, currency),
    },
    {
      key: 'score',
      header: 'Score',
      numeric: true,
      sortBy: (o) => o.rawScore,
      render: (o) => (
        <Badge tone={OPPORTUNITY_TONE[o.classification]}>{score(o.score, 0)}</Badge>
      ),
    },
  ];

  return (
    <SortableTable
      rows={opportunities}
      columns={columns}
      rowKey={(o) => o.id}
      initialSort="score"
      caption="Tracked opportunities, sortable by name, stage, estimated value or score."
      empty="No opportunities are being tracked yet."
    />
  );
}

/* ── Risk register ──────────────────────────────────────────────────────── */

export function RiskTable({ risks }: { risks: ScoredRisk[] }) {
  const columns: Column<ScoredRisk>[] = [
    {
      key: 'risk',
      header: 'Risk',
      sortBy: (r) => r.risk,
      render: (r) => (
        <div className="min-w-0">
          <Link
            href="/risk-radar"
            className="block truncate font-medium text-[var(--text-primary)] hover:text-[var(--brand)] hover:underline"
          >
            {r.risk}
          </Link>
          <p className="numeric mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
            {r.id} · {r.owner}
          </p>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      sortBy: (r) => r.dueDate,
      secondary: true,
      render: (r) => <span className="text-[var(--text-secondary)]">{date(r.dueDate)}</span>,
    },
    {
      key: 'trend',
      header: 'Trend',
      sortBy: (r) => r.trend,
      secondary: true,
      /*
       * Worsening is the one worth seeing from across the room, and it is the
       * only one coloured. Colouring all three would make a register where
       * nothing is wrong look as busy as one where everything is.
       */
      render: (r) => (
        <span
          className={
            r.trend === 'Worsening'
              ? 'font-medium text-[var(--negative)]'
              : 'text-[var(--text-secondary)]'
          }
        >
          {r.trend}
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      numeric: true,
      sortBy: (r) => r.score,
      render: (r) => <Badge tone={RISK_TONE[r.classification]}>{r.score.toFixed(2)}</Badge>,
    },
  ];

  return (
    <SortableTable
      rows={risks}
      columns={columns}
      rowKey={(r) => r.id}
      initialSort="score"
      caption="The risk register, sortable by name, due date, trend or score."
      empty="No risks are on the register yet."
    />
  );
}
