import * as React from 'react';

import { cn } from '@/lib/utils';

type InputProps = React.ComponentProps<'input'> & { variant?: 'default' | 'search' };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', variant, ...props }, ref) => (
    <input
      autoComplete="off"
      className={cn(
        'flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground shadow-sm',
        'placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'search' && 'pl-9',
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
