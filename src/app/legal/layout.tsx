import Link from 'next/link';
import Image from 'next/image';
import { LEGAL_VERSION, hasUnfilledDetails } from '@/lib/legal/documents';
import { withBasePath } from '@/lib/base-path';

/**
 * The frame every legal page shares.
 *
 * Readable without signing in, deliberately: somebody deciding whether to
 * create an account needs to read these first, and a privacy policy behind
 * authentication is not a privacy policy anyone can rely on.
 *
 * Set at a comfortable reading measure and left-aligned. These are documents
 * people are asked to actually read, and centred or full-width text is a way
 * of ensuring they do not.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src={withBasePath("/brand/amryn-icon-mark.png")}
              alt=""
              width={553}
              height={563}
              className="h-6 w-auto"
            />
            <span className="font-display text-[1.0625rem] font-extrabold tracking-tight text-[var(--text-primary)]">
              Amryn<span className="tm">™</span>
            </span>
          </Link>
          <Link
            href="/sign-in"
            className="text-[0.8125rem] font-medium text-[var(--brand)] hover:underline"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        {hasUnfilledDetails() ? <DraftNotice /> : null}

        <article className="legal">{children}</article>

        <nav className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--border)] pt-6 text-[0.8125rem]">
          <Link href="/legal/privacy" className="text-[var(--text-secondary)] hover:underline">
            Privacy Policy
          </Link>
          <Link href="/legal/terms" className="text-[var(--text-secondary)] hover:underline">
            Terms of Service
          </Link>
          <Link href="/legal/cookies" className="text-[var(--text-secondary)] hover:underline">
            Cookies
          </Link>
          <Link href="/legal/dpa" className="text-[var(--text-secondary)] hover:underline">
            Data Processing Addendum
          </Link>
          <span className="ml-auto text-[var(--text-tertiary)]">Version {LEGAL_VERSION}</span>
        </nav>
      </main>
    </div>
  );
}

/**
 * Shown while the responsible party's details are still placeholders.
 *
 * A privacy policy naming nobody is not one anyone can act on — POPIA requires
 * a data subject to be able to reach the Information Officer — so the page says
 * that plainly rather than reading as finished. It disappears the moment the
 * details are filled in.
 */
function DraftNotice() {
  return (
    <div
      className="mb-10 rounded-[var(--radius-card)] border p-4"
      style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}
      role="note"
    >
      <p className="text-[0.875rem] font-medium" style={{ color: 'var(--warning)' }}>
        This document is not yet complete
      </p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        It still contains placeholders in square brackets, including the company registration
        details and the Information Officer this policy asks you to contact. It should be reviewed
        by a South African attorney and completed before the platform is offered to customers.
      </p>
    </div>
  );
}
