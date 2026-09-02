import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, PriorityBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { buildBusinessContext } from '@/features/intelligence/context';
import { generateRecommendations } from '@/lib/ai/intelligence';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Recommendations' };

/**
 * The AI Recommendation Engine (specification §10).
 *
 * Stored recommendations first — those have been reviewed and acted on — then
 * anything the reasoning layer produced for the current context. Where no
 * model is configured the page says so rather than showing an empty list that
 * implies there is nothing to recommend.
 */
export default async function RecommendationsPage() {
  const workspace = await requirePermission('view_recommendations');
  const supabase = await createClient();
  const currency = workspace.organisation.currency_code;

  const [storedResult, context] = await Promise.all([
    supabase
      .from('ai_recommendations')
      .select('*')
      .eq('organisation_id', workspace.organisation.id)
      .not('status', 'in', '("dismissed","done")')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false }),
    buildBusinessContext(workspace),
  ]);

  const stored = storedResult.data ?? [];
  const { recommendations: fresh, available } = await generateRecommendations(context);

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Recommendations"
        description="Where what is happening inside the business meets what is happening outside it. These are the suggestions neither half would produce alone."
      />

      <div className="space-y-5">
        {stored.length === 0 && fresh.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Sparkles className="size-4" />}
              title={available ? 'Nothing to recommend yet' : 'Recommendations are not switched on'}
              description={
                available
                  ? 'Amryn has not found a cross-cutting recommendation it can support with evidence. It will say nothing rather than manufacture advice — connect more internal and market sources to give it more to work with.'
                  : 'Joining an internal decline to an external shift in demand is a judgement, and a rule that manufactured one would be worse than no recommendation at all. Ask an administrator of your workspace to switch these on. Everything else — scoring, health, change detection and the briefing — is unaffected.'
              }
            />
          </Card>
        ) : null}

        {stored.map((recommendation) => (
          <Card key={recommendation.id} tone="brand">
            <CardHeader
              title={recommendation.title}
              subtitle={recommendation.summary}
              actions={
                <div className="flex items-center gap-1.5">
                  <PriorityBadge priority={recommendation.priority} />
                  <Badge tone="outline">{humanise(recommendation.status)}</Badge>
                </div>
              }
            />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="eyebrow">Why this matters</p>
                  <p className="text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
                    {recommendation.why_it_matters}
                  </p>
                </div>
                <div>
                  <p className="eyebrow">Recommended action</p>
                  <p className="text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
                    {recommendation.recommended_action}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] pt-3">
                {recommendation.impact_cents !== null ? (
                  <div>
                    <p className="eyebrow !mb-0 !text-[0.5625rem]">Estimated impact</p>
                    <p className="numeric text-[0.875rem] font-medium text-[var(--text-primary)]">
                      {formatMoney(Number(recommendation.impact_cents), currency)}
                      {recommendation.impact_note ? (
                        <span className="ml-2 font-sans text-[0.75rem] font-normal text-[var(--text-tertiary)]">
                          {recommendation.impact_note}
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="eyebrow !mb-0 !text-[0.5625rem]">Confidence</p>
                  <p className="numeric text-[0.875rem] font-medium text-[var(--text-primary)]">
                    {Math.round(Number(recommendation.confidence) * 100)}%
                  </p>
                </div>
                <Badge tone="neutral" className="ml-auto">
                  {recommendation.generated_by === 'llm' ? 'AI written' : 'Computed'}
                </Badge>
              </div>
            </CardBody>
          </Card>
        ))}

        {fresh.length > 0 ? (
          <>
            <div className="flex items-center gap-3 pt-2">
              <span className="eyebrow !mb-0">New this session</span>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            {fresh.map((recommendation, i) => (
              <Card key={`${recommendation.title}-${i}`}>
                <CardHeader
                  title={recommendation.title}
                  subtitle={recommendation.summary}
                  actions={<PriorityBadge priority={recommendation.priority} />}
                />
                <CardBody>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="eyebrow">Why this matters</p>
                      <p className="text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
                        {recommendation.whyItMatters}
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow">Recommended action</p>
                      <p className="text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
                        {recommendation.recommendedAction}
                      </p>
                    </div>
                  </div>

                  {recommendation.evidence.length > 0 ? (
                    <div className="mt-4 border-t border-[var(--border)] pt-3">
                      <p className="eyebrow">Evidence</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {recommendation.evidence.map((item, index) => (
                          <li key={index}>
                            <Badge tone="outline" className="!normal-case">
                              {item.source}: {item.reference}
                              {item.note ? ` — ${item.note}` : ''}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </>
        ) : null}
      </div>
    </>
  );
}
