import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { nextSort, type SortState } from '@/components/sortable-table-head';

export function useListSearchParams<K extends string>(keys: readonly K[], defaultKey: K) {
  const [params, setParams] = useSearchParams();
  const key = keys.find((key) => key === params.get('sort')) ?? defaultKey;
  const sort: SortState<K> = { key, dir: params.get('dir') === 'desc' ? 'desc' : 'asc' };
  const pageNumber = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const update = useCallback(
    (values: Record<string, string>) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [name, value] of Object.entries(values)) {
            if (value) next.set(name, value);
            else next.delete(name);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return {
    searchQuery: params.get('q') ?? '',
    setSearchQuery: (q: string) => update({ q, page: '1' }),
    sort,
    handleSort: (key: K) => {
      const next = nextSort(sort, key);
      update({ sort: next.key, dir: next.dir, page: '1' });
    },
    page,
    showMore: () => update({ page: String(page + 1) }),
  };
}
