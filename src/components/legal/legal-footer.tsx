import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

const LINKS = [
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/cookies', label: 'Cookies' },
  { href: '/legal/dpa', label: 'Data Processing' },
] as const;

/**
 * The legal links, in the places somebody looks for them.
 *
 * One component rather than four copies, so a document that gets added or
 * renamed does not survive in three footers as a dead link — the commonest way
 * a privacy policy quietly becomes unreachable.
 *
 * ── the version sits here too ────────────────────────────────────────────
 * It used to live at the foot of the navigation rail, where it was visible
 * only with the rail open and, on a phone, only behind the menu button. The
 * bottom of the page is where the rest of the small print already is, and the
 * version is small print: the thing somebody reads out when describing a
 * problem, beside the documents they are pointed at when they ask what Amryn
 * does with their data.
 *
 * Still the lowest-contrast text on the page and still monospaced, because it
 * exists to be copied accurately rather than looked at.
 */
export function LegalFooter({ className, version }: { className?: string; version?: string }) {
  return (
    <footer
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem] text-[var(--text-tertiary)]',
        className,
      )}
    >
      <span>© {new Date().getFullYear()} Amryn</span>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="hover:text-[var(--text-secondary)]">
          {link.label}
        </Link>
      ))}
      {version ? <span className="font-mono">v{version}</span> : null}
    </footer>
  );
}
