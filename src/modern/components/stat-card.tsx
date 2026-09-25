import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type StatCardProps = {
  className?: string;
  label: ReactNode;
  tone?: 'default' | 'muted';
  value: ReactNode;
};

export function StatCard({ className, label, tone = 'muted', value }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        tone === 'default' ? 'border-info bg-info-bg text-info' : 'border-border bg-muted/50',
        className,
      )}
    >
      <p className="text-2xs font-semibold uppercase tracking-eyebrow text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
