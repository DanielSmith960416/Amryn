import Image from 'next/image';
import { LegalFooter } from '@/components/legal/legal-footer';
import { withBasePath } from '@/lib/base-path';
import { MARKETING_SITE_URL } from '@/lib/marketing-site';

/**
 * Rendered per request, so these pages carry the settings the server holds now.
 *
 * `RuntimeEnv` in the root layout writes the public settings into the document
 * so an image built without them still works — set the variable, restart,
 * done. A prerendered page defeats that silently: it runs at build time, when
 * the values are absent, so it writes nothing, and the page ships with only
 * the build's inlined `undefined` to fall back on.
 *
 * /sign-in was already dynamic and so already correct. /sign-up,
 * /forgot-password and /reset-password were prerendered — verified against a
 * standalone server built with the variables unset and run with them set:
 * window.__AMRYN_ENV__ was present on /sign-in and absent on the other three.
 *
 * Nothing reads it there yet, because browser-side Supabase is unused today
 * and auth goes through server actions. This is not a fix for a current
 * outage; it is closing the gap before the first client component to call
 * createClient() on one of these pages fails in production only, on an image
 * built without build arguments, with an invalid-key message naming a setting
 * that is plainly present in the dashboard.
 *
 * The cost is four small uncached forms rendering per request, which is what
 * the sign-in page already does.
 */
export const dynamic = 'force-dynamic';

/**
 * The way in: one panel, centred, on the same ground as the platform behind it.
 *
 * ── what this replaced, and why ───────────────────────────────────────────
 * It used to be a two-panel split — the navy intelligence environment on the
 * left carrying the product claim, the form on a light surface to its right.
 * That was a good page and it is worth saying what was wrong with it: the navy
 * half was the only dark surface in a light product, it was hidden entirely
 * below `lg` (so the smaller the screen, the less of Amryn you saw), and the
 * claim it carried is the same claim the marketing site makes better, to
 * people who have not already decided to sign in.
 *
 * One centred card says the same thing in less space and looks the same on a
 * phone as on a desk. The ground, the frost and the radius are the platform's
 * own, so the first screen a customer sees is made of the material every
 * screen after it is made of.
 *
 * The decoration is deliberately behind everything and deliberately quiet: a
 * dot grid and the mark bleeding off the right edge at low opacity. Both are
 * `aria-hidden`, neither is in the tab order, and both fade out below `sm`
 * where the card needs the whole screen.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-6">
      {/* ── the grid ──────────────────────────────────────────────────────
          Two crossed gradients rather than an image: 1.2 KB of CSS instead of
          a tile to fetch, and it takes the theme's own ink colour, so it is
          the same grid a stop darker in the medium theme. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden opacity-[0.55] sm:block"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text-primary) 12%, transparent) 1px, transparent 0)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(70rem 50rem at 50% 40%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(70rem 50rem at 50% 40%, black, transparent 75%)',
        }}
      />

      {/* ── the mark, bleeding off the edge ───────────────────────────────
          Supplied artwork at low opacity, never re-coloured or outlined — the
          brand pack is explicit about that, and the opacity is on the element
          rather than baked into a second file for the same reason. */}
      <Image
        aria-hidden
        alt=""
        src={withBasePath('/brand/amryn-icon-mark.png')}
        width={553}
        height={563}
        priority={false}
        className="pointer-events-none absolute -right-24 bottom-[-6rem] hidden w-[32rem] max-w-[55vw] opacity-[0.06] lg:block"
      />

      <main className="relative w-full max-w-[26rem]">
        <div className="glass-strong rounded-[var(--radius-card)] px-6 py-7 sm:px-8 sm:py-8">
          {/* The mark leaves the application deliberately. There is one
              marketing site and it is not this server, so this links to the
              site in docs/ — a plain anchor rather than next/link, because
              this is a different origin. */}
          <a
            href={MARKETING_SITE_URL}
            aria-label="Amryn"
            className="inline-flex items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]"
          >
            {/*
              The mark and the wordmark, composed as the platform's own top bar
              composes them — not the lockup file.

              The lockup is a second drawing of the name, with its own
              letterforms and the tagline locked underneath. It is correct
              artwork and it was here on the reasoning that nothing on this
              screen competes with it. Nothing on this screen does; the screen
              after it does. Somebody signs in and the name they just read is
              set differently one second later, which reads as two products
              rather than as one door into one.

              Supplied artwork only — never recoloured, stretched or outlined.
            */}
            <Image
              src={withBasePath('/brand/amryn-icon-mark.png')}
              alt=""
              aria-hidden
              width={553}
              height={563}
              priority
              className="h-8 w-auto"
            />
            <span className="font-display text-[1.5rem] font-extrabold tracking-tight text-[var(--text-primary)]">
              Amryn<span className="tm">™</span>
            </span>
          </a>

          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-center font-mono text-[0.6875rem] leading-relaxed text-[var(--text-tertiary)]">
          Amryn<span className="tm">™</span> AIGrowthIntelligence<span className="tm">®</span>{' '}
          Software · Kimberley, Northern Cape
        </p>

        <LegalFooter className="mt-3 w-full justify-center" />
      </main>
    </div>
  );
}
