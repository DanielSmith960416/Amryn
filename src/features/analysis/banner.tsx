import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth/session';
import { FIELD_LABELS } from './gap-labels';
import { latestRunFor } from './record';

/**
 * What the last reading of this business concluded, and how far to trust it.
 *
 * Until now this existed in three database columns and nowhere a person looks.
 * That is the failure the columns were added to prevent: analysis_runs
 * freezes the Quality Score gate, business_insights carries is_provisional on
 * every row, and a customer reading those insights on a screen saw a set of
 * confident findings with no indication that the platform itself considered
 * them provisional.
 *
 * ── why the caveat leads rather than sits in a footnote ───────────────────
 *
 * A reader who learns a figure is provisional *after* reading it has already
 * formed the view. The banner is above the numbers for the same reason the
 * column exists rather than a sentence in the narrative: a caveat that arrives
 * late is a caveat that arrives after the decision.
 *
 * ── and why it names the fields ───────────────────────────────────────────
 *
 * "Provisional" alone is a verdict with no remedy — it tells somebody their
 * analysis is weak and leaves them nowhere to go. The gaps are the remedy, so
 * they are on the screen: these four answers are what would change it.
 */
export async function AnalysisBanner() {
  const workspace = await requireWorkspace();
  const run = await latestRunFor(workspace.organisation.id);
  if (!run) return null;

  if (run.status === 'queued' || run.status === 'running') {
    return (
      <Notice tone="working">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
          Reading your business now
        </p>
        <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
          This takes a few minutes. Nothing on this page is waiting on it — the figures
          below are already yours.
        </p>
      </Notice>
    );
  }

  if (run.status === 'failed') {
    return (
      <Notice tone="failed">
        <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
          The last reading did not finish
        </p>
        <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
          Nothing was written, so what is below is unchanged from before it ran. It will
          be tried again.
        </p>
      </Notice>
    );
  }

  if (!run.isProvisional) return null;

  const named = run.gaps.filter((gap) => FIELD_LABELS[gap]).slice(0, 4);

  return (
    <Notice tone="provisional">
      <p className="text-[0.875rem] font-medium text-[var(--text-primary)]">
        {run.insightCount === 0
          ? 'This reading could not conclude anything yet'
          : `Everything below is provisional`}
      </p>
      <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
        {run.qualityScore === null
          ? 'Your Imprint has not been scored, so the platform is treating what it found as unconfirmed and is not discussing expansion.'
          : `Your Imprint scores ${run.qualityScore} out of 100. Below 70 the platform marks its findings unconfirmed and does not discuss expansion.`}
      </p>
      {named.length > 0 ? (
        <p className="mt-2 text-[0.8125rem] text-[var(--text-secondary)]">
          It could not answer without:{' '}
          <span className="text-[var(--text-primary)]">
            {named.map((gap) => FIELD_LABELS[gap]).join(', ')}
          </span>
          .
        </p>
      ) : null}
      <Link
        href="/imprint/review"
        className="mt-2 inline-block text-[0.8125rem] font-medium text-[var(--brand)] underline underline-offset-2"
      >
        Fill these in
      </Link>
    </Notice>
  );
}

const TONE = {
  working: 'border-[var(--brand)]/30 bg-[var(--brand)]/8',
  provisional: 'border-amber-500/35 bg-amber-500/10',
  failed: 'border-red-500/35 bg-red-500/10',
} as const;

function Notice({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-xl border px-4 py-3 ${TONE[tone]}`}>{children}</div>;
}
