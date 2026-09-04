import { cn } from '@/lib/utils/cn';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/**
 * The surface every panel in Amryn sits on.
 *
 * A frosted panel: translucent, blurred over the ground behind it, with a
 * light edge across the top that fades to a hairline by the bottom. The depth
 * comes from the blur rather than from a stack of shadows — see the Glass
 * section of globals.css for why, and for where the treatment is deliberately
 * withheld.
 *
 * `solid` opts a panel out. Use it for anything holding a lot of small text —
 * a table of figures read through frosted glass is harder to read, and this
 * product is read by people checking numbers.
 *
 * The hover lift stays opt-in via `interactive`, because a card that lifts
 * when you pass over it had better do something when you click it.
 */
export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  elevated?: boolean;
  interactive?: boolean;
  /** Opt out of the frost. For tables, forms and long documents. */
  solid?: boolean;
  tone?: 'default' | 'positive' | 'warning' | 'negative' | 'brand';
}

const TONE_RING: Record<NonNullable<CardProps['tone']>, string> = {
  default: '',
  positive: 'border-l-2 border-l-[var(--positive)]',
  warning: 'border-l-2 border-l-[var(--warning)]',
  negative: 'border-l-2 border-l-[var(--negative)]',
  brand: 'border-l-2 border-l-[var(--brand)]',
};

export function Card({
  className,
  elevated = false,
  interactive = false,
  solid = false,
  tone = 'default',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        solid
          ? [
              'rounded-[var(--radius-card)] border border-[var(--border)]',
              elevated ? 'bg-[var(--card-elevated)]' : 'bg-[var(--card)]',
              'shadow-[var(--shadow-card)]',
            ]
          : [elevated ? 'glass-strong' : 'glass', interactive && 'glass-lift'],
        interactive &&
          solid &&
          'transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lift)]',
        TONE_RING[tone],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-3', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h3 className="truncate text-[0.9375rem] font-semibold text-[var(--text-primary)]">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-[var(--border)] px-5 py-3 text-[0.8125rem]',
        className,
      )}
      {...props}
    />
  );
}
