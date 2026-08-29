'use client';

import type { TooltipProps } from 'recharts';

/**
 * One tooltip for every chart in the platform, so a hover reads the same way
 * on the Command Centre as it does in a report.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: TooltipProps<number, string> & {
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 shadow-[var(--shadow-pop)]">
      {label ? (
        <p className="eyebrow mb-1.5 !text-[var(--text-tertiary)]">{String(label)}</p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-[0.8125rem]">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-[var(--text-secondary)]">{entry.name}</span>
            <span className="numeric ml-auto font-medium text-[var(--text-primary)]">
              {formatter && typeof entry.value === 'number'
                ? formatter(entry.value, String(entry.name))
                : String(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
