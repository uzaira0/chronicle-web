import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type FieldHintProps = {
  children: ReactNode;
  className?: string;
};

export function FieldHint({ children, className }: FieldHintProps) {
  return <p className={cn('text-xs leading-5 text-muted-foreground', className)}>{children}</p>;
}
