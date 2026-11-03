import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-label uppercase',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      casing: { natural: 'normal-case tracking-normal' },
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        muted: 'border-border bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        success: 'border-success bg-success-bg text-success',
        warning: 'border-warning bg-warning-bg text-warning',
        destructive: 'border-destructive bg-danger-bg text-destructive',
      },
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, casing, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ className, variant, casing }))} {...props} />;
}
