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
 */
export function LegalFooter({ className }: { className?: string }) {
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
    </footer>
  );
}
