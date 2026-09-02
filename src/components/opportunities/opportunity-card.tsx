import { ArrowUpRight, Bookmark, CalendarClock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { daysUntil, formatDate, formatMoney, humanise } from '@/lib/utils/format';
import type { OpportunityClassification } from '@/lib/engines/opportunity-score';
import type { Enums } from '@/types/database';

/**
 * The OpportunityRadar® card (specification §9).
 *
 * "Why this matters" is not decoration — it is the reason the card exists.
 * An opportunity the platform cannot explain in one sentence should not have
 * been surfaced, so the field is required in the shape below.
 */
export interface OpportunityCardData {
  id: string;
  title: string;
  kind: Enums['opportunity_kind'];
  stage: Enums['opportunity_stage'];
  counterparty: string | null;
  summary: string;
  whyItMatters: string | null;
  recommendedAction: string | null;
  estimatedValueCents: number | null;
  score: number | null;
  classification: OpportunityClassification | null;
  closesOn: string | null;
  sourceUrls: string[];
  isSaved: boolean;
}

const CLASSIFICATION_TONE: Record<OpportunityClassification, 'positive' | 'brand' | 'info' | 'neutral'> = {
  high_priority: 'positive',
  strong: 'brand',
  potential: 'info',
  monitor: 'neutral',
};

export function OpportunityCard({
  opportunity,
  currency = 'ZAR',
  actions,
  className,
}: {
  opportunity: OpportunityCardData;
  currency?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const remaining = daysUntil(opportunity.closesOn);
  const closingSoon = remaining !== null && remaining >= 0 && remaining <= 21;

  return (
    <Card interactive className={cn('flex h-full flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{humanise(opportunity.kind)}</Badge>
            {opportunity.classification ? (
              <Badge tone={CLASSIFICATION_TONE[opportunity.classification]}>
                {humanise(opportunity.classification)}
              </Badge>
            ) : null}
            {opportunity.isSaved ? (
              <Bookmark className="size-3.5 fill-[var(--brand)] text-[var(--brand)]" aria-label="Saved" />
            ) : null}
          </div>
          <h3 className="text-[0.9375rem] leading-snug font-semibold text-[var(--text-primary)]">
            {opportunity.title}
          </h3>
          {opportunity.counterparty ? (
            <p className="mt-0.5 text-[0.75rem] text-[var(--text-tertiary)]">
              {opportunity.counterparty}
            </p>
          ) : null}
        </div>

        {opportunity.score !== null ? (
          <div className="shrink-0 text-right">
            <p className="numeric text-[1.5rem] leading-none font-semibold text-[var(--brand)]">
              {Math.round(opportunity.score)}
            </p>
            <p className="eyebrow !mb-0 mt-1 !text-[0.5625rem]">Score</p>
          </div>
        ) : null}
      </div>

      <div className="flex-1 px-5 pt-3">
        <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          {opportunity.summary}
        </p>

        {opportunity.whyItMatters ? (
          <div className="mt-3 rounded-[var(--radius-tile)] bg-[var(--card-inset)] px-3 py-2.5">
            <p className="eyebrow !mb-1 !text-[0.5625rem]">Why this matters</p>
            <p className="text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
              {opportunity.whyItMatters}
            </p>
          </div>
        ) : null}

        {opportunity.recommendedAction ? (
          <p className="mt-3 flex gap-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
            {opportunity.recommendedAction}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] px-5 py-3">
        <div>
          <p className="eyebrow !mb-0 !text-[0.5625rem]">Estimated value</p>
          <p className="numeric text-[0.875rem] font-medium text-[var(--text-primary)]">
            {opportunity.estimatedValueCents === null
              ? 'Not yet sized'
              : formatMoney(opportunity.estimatedValueCents, currency)}
          </p>
        </div>

        {opportunity.closesOn ? (
          <div>
            <p className="eyebrow !mb-0 !text-[0.5625rem]">Window</p>
            <p
              className={cn(
                'flex items-center gap-1 text-[0.875rem] font-medium',
                closingSoon ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]',
              )}
            >
              {closingSoon ? <CalendarClock className="size-3.5" aria-hidden /> : null}
              {remaining !== null && remaining >= 0
                ? `${remaining} days`
                : formatDate(opportunity.closesOn)}
            </p>
          </div>
        ) : null}

        <Badge tone="neutral" className="ml-auto">
          {humanise(opportunity.stage)}
        </Badge>
      </div>

      {actions ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] px-5 py-3">{actions}</div>
      ) : null}
    </Card>
  );
}
