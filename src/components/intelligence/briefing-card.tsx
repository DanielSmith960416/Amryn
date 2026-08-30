import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { ExecutiveBriefing, Finding } from '@/types/intelligence';

/**
 * The Executive Intelligence Summary (specification §7).
 *
 * The prose may come from a language model, but the findings underneath it are
 * chosen by the engine from real data — so the card labels which it is. A
 * reader deserves to know whether they are looking at a computed finding or a
 * written one.
 */
const MARKER: Record<Finding['direction'], { glyph: string; className: string; label: string }> = {
  positive: { glyph: '↑', className: 'text-[var(--positive)]', label: 'Improving' },
  negative: { glyph: '↓', className: 'text-[var(--negative)]', label: 'Deteriorating' },
  opportunity: { glyph: '★', className: 'text-[var(--brand)]', label: 'Opportunity' },
  neutral: { glyph: '⚠', className: 'text-[var(--warning)]', label: 'Worth noting' },
};

export function BriefingCard({
  briefing,
  className,
}: {
  briefing: ExecutiveBriefing;
  className?: string;
}) {
  return (
    <Card elevated className={cn('overflow-hidden', className)} tone="brand">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow !mb-0">Business intelligence summary</p>
            <Badge tone={briefing.generatedBy === 'llm' ? 'brand' : 'outline'}>
              {briefing.generatedBy === 'llm' ? 'AI written' : 'Computed'}
            </Badge>
          </div>
          <h2 className="mt-2 text-[1.0625rem] leading-snug font-semibold text-[var(--text-primary)]">
            {briefing.headline}
          </h2>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
            {briefing.narrative}
          </p>
        </div>
      </div>

      {briefing.findings.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {briefing.findings.map((finding, i) => {
            const marker = MARKER[finding.direction];
            return (
              <li key={`${finding.headline}-${i}`} className="flex gap-3 px-5 py-3">
                <span
                  className={cn('mt-px shrink-0 font-mono text-[0.875rem]', marker.className)}
                  title={marker.label}
                  aria-label={marker.label}
                >
                  {marker.glyph}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
                    {finding.headline}
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {finding.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
