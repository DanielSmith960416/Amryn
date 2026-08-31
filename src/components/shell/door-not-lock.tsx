import { cn } from '@/lib/utils/cn';

/**
 * The notice that keeps this deployment honest.
 *
 * The client area is gated on the device, not on a server, because a static
 * site has no server to gate on. Saying so is not optional decoration: a form
 * that looks like a sign-in, on a page that looks like a product, will be read
 * as security unless it says otherwise in plain words.
 *
 * It appears on both entry pages and in Settings — everywhere someone might
 * form a belief about what this gate does.
 */
export function DoorNotLock({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--card-inset)] px-3 py-2.5',
        'text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]',
        className,
      )}
    >
      <strong className="font-semibold text-[var(--text-primary)]">
        No password, and no privacy.
      </strong>{' '}
      This site is served as static files, so there is no server to check a password or keep
      anything private. Your workspace is remembered on this device only, and every page of the
      platform can be opened directly by anyone with its address. The figures inside are an
      illustrative demonstration, not a real business — so nothing here is confidential.
    </p>
  );
}
