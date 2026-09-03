import { ArrowUpDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortState<K extends string> = { dir: 'asc' | 'desc'; key: K };

/** Re-clicking the active column flips direction; a new column starts ascending. */
export function nextSort<K extends string>(prev: SortState<K>, key: K): SortState<K> {
  return { dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc', key };
}

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
          'flex items-center gap-1 hover:text-foreground',
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
