import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DemoNotice, PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import type { WeeklyBrief } from '@/lib/intelligence/briefing';
import { loadWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Weekly & Monthly Briefs' };

/**
 * WEEKLY_INTELLIGENCE and MONTHLY_INTELLIGENCE.
 *
 * The formal weekly executive report the client receives in PDF is generated
 * from this same brief — `/api/reports/weekly` renders exactly what is on this
 * page. That is the point of the workspace seam: the page and the PDF cannot
 * disagree, because there is one computation and two renderings of it.
 */
export default function ReportsPage() {
  const w = loadWorkspace();

  return (
    <>
      <PageHeader
        eyebrow="Reporting"
        title="Weekly & Monthly Briefs"
        description="The executive brief, computed from the same figures that drive every view in this workspace."
        actions={
          <>
            <Button asChild variant="primary">
              <a href="/api/reports/weekly" target="_blank" rel="noopener">
                Open the weekly PDF
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/api/reports/monthly" target="_blank" rel="noopener">
                Monthly report
              </a>
            </Button>
          </>
        }
      />

      {w.isDemo ? <DemoNotice /> : null}

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <BriefCard brief={w.weekly} />
        <BriefCard brief={w.monthly} />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="How the report is produced"
          subtitle="Worth knowing before it goes to a board"
        />
        <CardBody className="space-y-3 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
          <p>
            Every sentence above is computed from the figures in this workspace, not written in
            advance. Where a claim names a number, a branch or a record ID, that value came from the
            data and will change with it.
          </p>
          <p>
            The report opens as a print-ready page. Use your browser&rsquo;s Print dialog and choose
            &ldquo;Save as PDF&rdquo; — the layout, page breaks and margins are already set for A4.
            Generating the file server-side would mean shipping a headless browser into the
            deployment, which is a great deal of weight for a document the browser can already
            produce faithfully.
          </p>
          <p>
            Forecast figures anywhere in the report are projections on the year-to-date average.
            They carry that warning wherever they appear.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function BriefCard({ brief }: { brief: WeeklyBrief }) {
  return (
    <Card>
      <CardHeader
        eyebrow={`${brief.companyName} · ${brief.weekEnding}`}
        title={brief.title}
      />
      <CardBody>
        <div className="space-y-5">
          {brief.sections.map((s) => (
            <section key={s.heading}>
              <h3 className="font-display text-[0.875rem] font-semibold text-[var(--text-primary)]">
                ◆ {s.heading}
              </h3>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                {s.body}
              </p>
              {s.items ? (
                <ol className="mt-2 space-y-1">
                  {s.items.map((item, i) => (
                    <li
                      key={item}
                      className="flex gap-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]"
                    >
                      <span className="numeric text-[var(--text-tertiary)]">{i + 1}.</span>
                      {item}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ))}
        </div>

        <p className="mt-5 border-t border-[var(--border)] pt-4 text-[0.75rem] leading-relaxed text-[var(--text-tertiary)]">
          {brief.disclaimer}
        </p>
      </CardBody>
    </Card>
  );
}
