import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { nextSort, type SortState } from '@/lib/sort';

/** Writes URL search parameters in place (no history entry); an empty value removes the parameter. */
export function useSearchParamsUpdate() {
  const [params, setParams] = useSearchParams();
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
  return [params, update] as const;
}

/** One piece of page state kept in the URL, so a copied link restores it. */
export function useSearchParamValue<V extends string>(
  name: string,
  defaultValue: V,
  allowed?: readonly V[],
): [V, (value: V) => void] {
  const [params, update] = useSearchParamsUpdate();
  const raw = params.get(name);
  const value = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? (raw as V) : defaultValue;
  return [value, (next: V) => update({ [name]: next })];
}

export function useListSearchParams<K extends string>(keys: readonly K[], defaultKey: K) {
  const [params, update] = useSearchParamsUpdate();
  const key = keys.find((key) => key === params.get('sort')) ?? defaultKey;
  const sort: SortState<K> = { key, dir: params.get('dir') === 'desc' ? 'desc' : 'asc' };
  const pageNumber = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
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
