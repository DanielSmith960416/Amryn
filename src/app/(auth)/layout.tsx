import Image from 'next/image';
import Link from 'next/link';

/**
 * Sign-in chrome: the dark navy intelligence environment on the left, the form
 * on a clean surface on the right. The claim is made before the credentials
 * are asked for.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#081B33] p-10 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/brand/amryn-icon-mark-white.png"
            alt=""
            width={553}
            height={563}
            className="h-7 w-auto"
            priority
          />
          <span className="font-display text-[1.125rem] font-extrabold tracking-tight text-white">
            Amryn<span className="tm">™</span>
          </span>
        </Link>

        <div className="relative max-w-md">
          <p className="font-mono text-[0.6875rem] tracking-[0.16em] text-[#3E7BD6] uppercase">
            AIGrowthIntelligence<span className="tm">®</span> Software
          </p>
          <h1 className="font-display mt-4 text-[2.25rem] leading-[1.1] font-bold tracking-tight text-white">
            See your business.
            <br />
            See your market.
            <br />
            <span className="text-[#3E7BD6]">Know what to do next.</span>
          </h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-[#8BA3C7]">
            A continuously updated AI DigitalTwin<span className="tm">®</span> of what is happening
            inside your business, and an AI OpportunityRadar<span className="tm">®</span> watching
            the market outside it — converging in one Executive Command Centre.
          </p>
        </div>

        <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-[#64799A]">
          Business Inside &nbsp;+&nbsp; Market Outside &nbsp;=&nbsp; Intelligent Growth
        </p>

        {/* A quiet radar sweep, not a decoration that competes with the words. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-40 size-[28rem] rounded-full border border-[#1E3A5F]"
        >
          <div className="absolute inset-12 rounded-full border border-[#1E3A5F]" />
          <div className="absolute inset-24 rounded-full border border-[#1E3A5F]" />
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
