import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  actions?: ReactNode;
  className?: string;
  description: ReactNode;
  eyebrow?: string;
  icon?: ReactNode;
  /**
   * `compact` drops the eyebrow chip and shrinks the heading. Use it for sections that
   * already sit under a label — the study tab bar names the section, so the full-size
   * header below it was a chip, a 4xl heading and a sentence all saying "Participants".
   */
  size?: 'compact' | 'default';
  title: ReactNode;
};

export function SectionHeader({
  actions,
  className,
  description,
  eyebrow,
  icon,
  size = 'default',
  title,
}: SectionHeaderProps) {
  const compact = size === 'compact';
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        compact && 'sm:items-center',
        className,
      )}
    >
      <div className={compact ? 'space-y-1' : 'space-y-3'}>
        {eyebrow && !compact && (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-sm border bg-[var(--eq-info-bg)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--eq-info)] [border-color:var(--eq-info)]">
            {icon}
            {eyebrow}
          </div>
        )}
        <div className={compact ? undefined : 'space-y-2'}>
          <h2
            className={cn(
              'eq-heading font-semibold tracking-tight text-foreground',
              compact ? 'text-xl' : 'text-3xl sm:text-4xl',
            )}
          >
            {title}
          </h2>
          <p className={cn('max-w-3xl text-muted-foreground', compact ? 'text-sm' : 'text-base leading-7')}>
            {description}
          </p>
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
