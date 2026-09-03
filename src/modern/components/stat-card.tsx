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
        'eq-metric rounded-lg border p-4',
        tone === 'default'
          ? 'bg-[var(--eq-info-bg)] text-[var(--eq-info)] [border-color:var(--eq-info)]'
          : 'border-border bg-muted/50',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
