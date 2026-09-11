'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The pages of one section, along the top of it.
 *
 * Three sidebar rows for Data Sources, Files and imports and Integrations was
 * three rows describing one place. They are the same section — the same data,
 * looked at three ways — and a sidebar that lists every page of every section
 * stops being navigation and becomes a table of contents.
 *
 * So the section keeps one row, and its pages move here. Nothing is hidden:
 * every tab is visible the moment you are in the section, which is the moment
 * it is relevant, rather than permanently, from everywhere.
 *
 * ── why links rather than state ──────────────────────────────────────────
 *
 * Each tab is a real page with its own URL, so each is an anchor. That keeps
 * the back button, sharing a link, and opening one in a new tab all working —
 * none of which survives a tab strip built out of component state.
 */
export interface SectionTab {
  label: string;
  href: string;
}

/**
 * Which tab a path belongs to — the longest match wins.
 *
 * /data is a prefix of /data/imports, so a plain startsWith lights both and
 * the section looks like it is in two places at once. Taking the most specific
 * match is what makes a parent tab lose to its own child.
 *
 * Exported because it is the only part of this file with a decision in it, and
 * because getting it wrong looks like a styling glitch rather than a bug.
 */
export function activeTab(pathname: string, tabs: readonly SectionTab[]): string | undefined {
  return [...tabs]
    .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function SectionTabs({ tabs }: { tabs: readonly SectionTab[] }) {
  const pathname = usePathname();
  const active = activeTab(pathname, tabs);

  return (
    <nav
      aria-label="Section"
      className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)]"
    >
      {tabs.map((tab) => {
        const current = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={
              'whitespace-nowrap border-b-2 px-3 py-2 text-[0.8125rem] transition-colors ' +
              (current
                ? 'border-[var(--brand)] font-semibold text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]')
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
