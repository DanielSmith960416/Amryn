import Image from 'next/image';
import Link from 'next/link';
import { AIGrowthIntelligence, TM } from '@/components/shell/tm';
import { withBasePath } from '@/lib/base-path';

/**
 * The sign-up and sign-in surround.
 *
 * Deliberately quiet: one column, the mark, the form, and the way back to the
 * public site. Onboarding leads into the platform, so nothing here competes
 * with the form for attention.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="px-5 py-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image
            src={withBasePath("/brand/amryn-icon-mark.png")}
            alt=""
            width={553}
            height={563}
            className="size-6 w-auto dark:hidden"
            priority
          />
          <Image
            src={withBasePath("/brand/amryn-icon-mark-white.png")}
            alt=""
            width={553}
            height={563}
            className="hidden size-6 w-auto dark:block"
            priority
          />
          <span className="font-display text-[0.9375rem] font-semibold tracking-tight">
            <TM>Amryn</TM> <AIGrowthIntelligence />
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-4 pb-16 sm:px-8">
        <div className="w-full max-w-[27rem]">{children}</div>
      </main>

      <footer className="px-5 pb-8 text-center text-[0.75rem] text-[var(--text-tertiary)] sm:px-8">
        <p>
          <TM>Amryn</TM> <AIGrowthIntelligence /> is a trademark of Amryn. © 2026 Amryn.
        </p>
      </footer>
    </div>
  );
}
