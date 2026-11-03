declare const validatedSelection: unique symbol;
export type SyncExportSelection = string[] & { readonly [validatedSelection]: true };

/** Only nonempty identity sets can reach a synchronous export mutation. */
export function toSyncExportSelection(ids: readonly string[]): SyncExportSelection | null {
  const unique = [...new Set(ids)];
  return unique.length > 0 ? (unique as SyncExportSelection) : null;
}
