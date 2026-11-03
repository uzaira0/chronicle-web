export type SortState<K extends string> = { dir: 'asc' | 'desc'; key: K };

/** Re-clicking the active column flips direction; a new column starts ascending. */
export function nextSort<K extends string>(prev: SortState<K>, key: K): SortState<K> {
  return { dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc', key };
}
