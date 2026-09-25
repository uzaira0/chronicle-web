import { RefreshCcw } from 'lucide-react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslator } from '@/i18n';
import { cn } from '@/lib/utils';

type StatePanelTone = 'default' | 'destructive';

type StatePanelProps = {
  actions?: React.ReactNode;
  className?: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  eyebrow?: string;
  /** Renders a "Try again" button, so a failed load recovers without a full page reload. */
  onRetry?: () => unknown;
  title: React.ReactNode;
  tone?: StatePanelTone;
};

const toneClasses: Record<StatePanelTone, string> = {
  default: 'text-primary',
  destructive: 'text-destructive',
};

export function StatePanel({
  actions,
  className,
  description,
  eyebrow,
  icon,
  onRetry,
  title,
  tone = 'default',
}: StatePanelProps) {
  const { t } = useTranslator();
  const retry = onRetry && (
    <Button onClick={() => void onRetry()} variant="outline">
      <RefreshCcw className="mr-2 h-4 w-4" />
      {t('common.try_again')}
    </Button>
  );
  return (
    // Announced feedback (Equal invariant): errors interrupt as an alert, everything else is a polite status.
    <Card
      className={cn('w-full max-w-xl', tone === 'destructive' && 'border-destructive/40', className)}
      role={tone === 'destructive' ? 'alert' : 'status'}
    >
      <CardHeader>
        <div className={cn('flex items-center gap-3', toneClasses[tone])}>
          {icon}
          {eyebrow && <span className="text-xs font-semibold uppercase tracking-eyebrow-wide">{eyebrow}</span>}
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {(actions || retry) && (
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {retry}
            {actions}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Content-shaped loading state for table pages: pulsing rows where the table will appear,
// announced once to screen readers by `label`.
export function TableSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <output aria-busy="true" aria-label={label} className="grid gap-2">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows never reorder
        <div className="h-10 animate-pulse rounded-md bg-muted" key={i} />
      ))}
    </output>
  );
}

// Suspense fallback while a lazy route chunk downloads, so a slow network shows the page's
// shape instead of a blank area.
export function RouteSkeleton() {
  const { t } = useTranslator();
  return (
    <output aria-busy="true" aria-label={t('common.loading')} className="grid gap-3">
      <div className="h-14 animate-pulse rounded-lg bg-muted" />
      <div className="h-20 animate-pulse rounded-lg bg-muted" />
      <div className="h-20 animate-pulse rounded-lg bg-muted" />
    </output>
  );
}
