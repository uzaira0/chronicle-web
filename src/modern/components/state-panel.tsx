import type * as React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StatePanelTone = 'default' | 'destructive';

type StatePanelProps = {
  actions?: React.ReactNode;
  className?: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  eyebrow?: string;
  title: React.ReactNode;
  tone?: StatePanelTone;
};

const toneClasses: Record<StatePanelTone, string> = {
  default: 'text-primary',
  destructive: 'text-destructive',
};

const borderClasses: Record<StatePanelTone, string> = {
  default: '',
  destructive: 'border-destructive/40',
};

export function StatePanel({
  actions,
  className,
  description,
  eyebrow,
  icon,
  title,
  tone = 'default',
}: StatePanelProps) {
  return (
    <Card className={cn('w-full max-w-xl', borderClasses[tone], className)}>
      <CardHeader>
        <div className={cn('flex items-center gap-3', toneClasses[tone])}>
          {icon}
          {eyebrow && <span className="text-xs font-semibold uppercase tracking-[0.24em]">{eyebrow}</span>}
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {actions && <CardContent>{actions}</CardContent>}
    </Card>
  );
}
