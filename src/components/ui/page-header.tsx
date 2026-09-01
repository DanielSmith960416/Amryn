import type { ReactNode } from 'react';

/** Consistent page furniture: what this page is, and what can be done on it. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="font-display text-[1.5rem] font-semibold text-[var(--text-primary)] sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * The demonstration notice.
 *
 * Both workbooks stamp "DEMO DATA — Replace with actual data" on every sheet,
 * and the marketing site says the same beneath the Command Centre. It is
 * repeated on every page that renders demo figures rather than declared once at
 * sign-in: a reader who deep-links into the Risk Radar must not have to
 * remember a banner they never saw.
 */
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="mb-6 rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--warning-soft)] px-4 py-2.5 text-[0.8125rem] leading-relaxed text-[var(--warning)]">
      <strong className="font-semibold">Illustrative demonstration.</strong>{' '}
      {children ?? 'Every figure on this page is demo data, not a real client.'}
    </p>
  );
}
