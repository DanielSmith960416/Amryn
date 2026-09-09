import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireWorkspace } from '@/lib/auth/session';
import { explain, friendly, hasCaveats } from '@/features/assistant/explain';
import { isTraceable, traceBriefItem, traceFigure } from '@/features/assistant/trace';

export const metadata: Metadata = { title: 'Where this came from' };

/**
 * Any number on the platform, explained by walking back through where it came
 * from.
 *
 * Every accountability column in this schema was added on the argument that a
 * caveat one join away is lost the moment a figure is quoted onward. This is
 * where they are read together and turned into sentences — the difference
 * between a platform that could justify its numbers and one that does.
 *
 * It needs no model. Nothing on this page is written by one; it is what the
 * columns say, in order.
 */
export default async function ExplainPage({
  params,
}: {
  params: Promise<{ table: string; id: string }>;
}) {
  const { table, id } = await params;
  const workspace = await requireWorkspace();
  const org = workspace.organisation.id;

  const chain =
    table === 'brief_items'
      ? await traceBriefItem(org, id)
      : isTraceable(table)
        ? await traceFigure(org, table, id)
        : null;

  // No row, no reach, or a table this cannot explain — all the same to a
  // reader, and none of them worth guessing about.
  if (!chain) notFound();

  const steps = explain(chain);
  const caveats = hasCaveats(steps);

  return (
    <>
      <PageHeader
        eyebrow={friendly(chain.figure.table)}
        title={chain.figure.label}
        description="Where this came from, and what would stop you acting on it."
        actions={
          caveats ? (
            <Badge tone="warning">Read the caveats</Badge>
          ) : (
            <Badge tone="positive">Nothing qualifies this</Badge>
          )
        }
      />

      <Card>
        <CardHeader
          title="The chain"
          subtitle="Most important first — somebody who stops after two steps has still been told the two things that would change what they do"
        />
        <CardBody>
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={step.link} className="flex gap-3">
                <span
                  className="numeric mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-medium"
                  style={{
                    background: step.caveat ? 'var(--warning-soft, var(--card-inset))' : 'var(--card-inset)',
                    color: step.caveat ? 'var(--warning)' : 'var(--text-tertiary)',
                  }}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-medium text-[var(--text-primary)]">
                    {step.link}
                    {step.caveat ? (
                      <span className="ml-2 align-middle">
                        <Badge tone="warning">Caveat</Badge>
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                    {step.says}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 border-t border-[var(--border)] pt-4 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
            Nothing on this page was written by a model. Each line is what a column on the record
            says, read in order — which is why a link that could not be resolved is reported as
            unknown rather than filled in.
          </p>
        </CardBody>
      </Card>

      <div className="mt-5">
        <Button asChild variant="ghost">
          <Link href="/command-centre">Back</Link>
        </Button>
      </div>
    </>
  );
}
