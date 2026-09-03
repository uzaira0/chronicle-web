import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'eq-badge inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.12em] uppercase transition-colors',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        muted: 'border-border bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        success: 'bg-[var(--eq-success-bg)] text-[var(--eq-success)] [border-color:var(--eq-success)]',
        warning: 'bg-[var(--eq-warning-bg)] text-[var(--eq-warning)] [border-color:var(--eq-warning)]',
        destructive: 'bg-[var(--eq-danger-bg)] text-[var(--eq-danger)] [border-color:var(--eq-danger)]',
      },
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ className, variant }))} {...props} />;
}
