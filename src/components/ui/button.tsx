'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap ' +
    'transition-[background-color,color,border-color,transform] duration-150 ease-out ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--brand)] text-[var(--on-brand)] hover:bg-[var(--brand-strong)] active:translate-y-px',
        secondary:
          'border border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-primary)] hover:bg-[var(--card-inset)]',
        ghost: 'text-[var(--text-secondary)] hover:bg-[var(--card-inset)] hover:text-[var(--text-primary)]',
        soft: 'bg-[var(--brand-soft)] text-[var(--brand)] hover:bg-[var(--brand-soft)]/70',
        danger: 'bg-[var(--negative)] text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-[0.8125rem] [&_svg]:size-3.5',
        md: 'h-9.5 px-4 text-[0.875rem] [&_svg]:size-4',
        lg: 'h-11 px-5 text-[0.9375rem] [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ComponentPropsWithoutRef<'button'>,
    VariantProps<typeof button> {
  /** Render as the child element — for links that should look like buttons. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(button({ variant, size }), className)} {...props} />;
}

export { button as buttonVariants };
