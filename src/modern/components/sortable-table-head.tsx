import { ArrowUpDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import type { SortState } from '@/lib/sort';
import { cn } from '@/lib/utils';

/** Column header that toggles sort direction, with the sort state exposed to assistive tech. */
export function SortableTableHead<K extends string>({
  children,
  className,
  onSort,
  sort,
  sortKey,
}: {
  children: React.ReactNode;
  className?: string;
  onSort: (key: K) => void;
  sort: SortState<K>;
  sortKey: K;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      {...(className ? { className } : {})}
    >
      <button
        className={cn(
          'flex min-h-11 items-center gap-1 hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        onClick={() => onSort(sortKey)}
        type="button"
      >
        {children}
        <ArrowUpDown aria-hidden="true" className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </TableHead>
  );
}
