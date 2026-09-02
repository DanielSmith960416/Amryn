import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { requirePermission } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDate, humanise } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Strategic Initiatives' };

export default async function InitiativesPage() {
  const workspace = await requirePermission('view_goals');
  const supabase = await createClient();

  const { data: initiatives } = await supabase
    .from('strategic_initiatives')
    .select('*')
    .eq('organisation_id', workspace.organisation.id)
    .order('created_at', { ascending: false });

  return (
    <>
      <PageHeader
        eyebrow={workspace.organisation.name}
        title="Strategic Initiatives"
        description="The bets, and the thinking behind each one. An initiative without a thesis is a task list."
      />

      {(initiatives ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="No initiatives yet"
            description="An initiative groups goals and opportunities under a single thesis, so that progress can be judged against what you were trying to achieve."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(initiatives ?? []).map((initiative) => (
            <Card key={initiative.id}>
              <CardHeader
                title={initiative.title}
                actions={
                  <Badge
                    tone={
                      initiative.status === 'active'
                        ? 'brand'
                        : initiative.status === 'complete'
                          ? 'positive'
                          : 'outline'
                    }
                  >
                    {humanise(initiative.status)}
                  </Badge>
                }
              />
              <CardBody>
                {initiative.thesis ? (
                  <>
                    <p className="eyebrow">Thesis</p>
                    <p className="text-[0.875rem] leading-relaxed text-[var(--text-primary)]">
                      {initiative.thesis}
                    </p>
                  </>
                ) : null}

                <p className="mt-3 text-[0.75rem] text-[var(--text-tertiary)]">
                  {initiative.starts_on ? formatDate(initiative.starts_on) : 'No start date'}
                  {' → '}
                  {initiative.ends_on ? formatDate(initiative.ends_on) : 'open-ended'}
                  {initiative.goal_ids.length > 0
                    ? ` · ${initiative.goal_ids.length} linked ${initiative.goal_ids.length === 1 ? 'goal' : 'goals'}`
                    : ''}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
