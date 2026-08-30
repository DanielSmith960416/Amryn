import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <p className="eyebrow">404</p>
      <h1 className="text-[1.75rem] font-semibold text-[var(--text-primary)]">
        That page does not exist
      </h1>
      <p className="mt-2 max-w-sm text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
        The link may be out of date, or the page may be one your role cannot open.
      </p>
      <Button asChild variant="primary" className="mt-6">
        <Link href="/command-centre">Back to the Command Centre</Link>
      </Button>
    </div>
  );
}
