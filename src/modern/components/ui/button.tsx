import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'eq-btn inline-flex items-center justify-center gap-2 rounded-lg text-sm font-extrabold transition active:translate-y-px pointer-coarse:min-h-11 pointer-coarse:min-w-11 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
    'forced-colors:focus-visible:outline-[Highlight] ' +
    'disabled:pointer-events-none disabled:opacity-50 ring-offset-background',
  {
    variants: {
      variant: {
        default: 'eq-btn--primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        destructive: 'eq-btn--danger bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        ghost: 'hover:bg-muted hover:text-foreground',
        'ghost-muted': 'text-muted-foreground hover:bg-muted hover:text-foreground',
        muted: 'bg-muted text-muted-foreground hover:bg-muted/80',
        outline: 'border border-border bg-card text-foreground hover:bg-muted',
        selected: 'border border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15',
        'outline-destructive': 'border border-destructive/30 bg-card text-destructive hover:bg-destructive/10',
      },
      size: {
        default: 'h-10 px-4 py-2',
        icon: 'h-10 w-10 p-0',
        'icon-xs': 'h-auto w-auto rounded p-1',
        lg: 'h-11 px-5',
        sm: 'h-8 min-h-0 px-3 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return <Comp className={cn(buttonVariants({ className, size, variant }))} ref={ref} {...props} />;
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
