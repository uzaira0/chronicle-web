import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const cardVariants = cva('eq-card rounded-lg border border-border bg-card shadow-sm', {
  variants: {
    variant: {
      default: '',
      destructive: 'border-destructive/40',
      subtle: 'border-border/80',
      loading: 'animate-pulse',
      padded: 'space-y-3 p-4',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Card({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 px-6 py-5', className)} {...props} />;
}

const titleVariants = cva('text-lg text-balance font-semibold tracking-tight text-foreground', {
  variants: { layout: { icon: 'flex items-center gap-2' } },
});

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof titleVariants> & {
    as?: 'h1' | 'h2' | 'h3';
  };

export function CardTitle({ as: Heading = 'h3', className, layout, ...props }: CardTitleProps) {
  return <Heading className={cn(titleVariants({ layout }), className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
}

const contentVariants = cva('px-6 py-5', {
  variants: {
    spacing: { 2: 'space-y-2', 3: 'space-y-3', 4: 'space-y-4', 5: 'space-y-5', 6: 'space-y-6' },
    gap: { 4: 'gap-4', 5: 'gap-5' },
    layout: { 'diary-export': 'grid md:grid-cols-diary-export' },
    size: { small: 'text-sm' },
  },
});

export function CardContent({
  className,
  spacing,
  gap,
  size,
  layout,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof contentVariants>) {
  return <div className={cn(contentVariants({ spacing, gap, size, layout }), className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
