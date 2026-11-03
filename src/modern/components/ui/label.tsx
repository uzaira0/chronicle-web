import * as React from 'react';

import { cn } from '@/lib/utils';

type LabelProps = React.ComponentProps<'label'> & {
  required?: boolean;
  variant?: 'default' | 'muted' | 'small';
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ children, className, required, variant, ...props }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: generic label primitive; consumers provide htmlFor or wrap inputs
    <label
      className={cn(
        'block text-sm font-medium text-foreground',
        variant === 'muted' && 'text-muted-foreground',
        variant === 'small' && 'text-xs',
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      )}
    </label>
  ),
);

Label.displayName = 'Label';
