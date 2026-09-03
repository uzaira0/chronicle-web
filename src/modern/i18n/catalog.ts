import type { Translator } from './translator';

/**
 * Translatable presentation for the domain catalogs (study features, collection modules,
 * sensors, dispositions, export data types). The English labels stay in `lib/*` as the
 * source of truth; a language table may override any of them under `catalog.<kind>.<slug>`.
 * `scripts/i18n-sync-catalog.ts` regenerates the English `catalog` namespace from the
 * constants so translators always see the full key list.
 */
export type CatalogKind =
  | 'android_sensor'
  | 'data_type'
  | 'disposition'
  | 'disposition_description'
  | 'feature'
  | 'group'
  | 'health_connect'
  | 'ios_sensor'
  | 'module'
  | 'module_description'
  | 'privacy_class';

export function catalogSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function catalogKey(kind: CatalogKind, value: string): string {
  return `catalog.${kind}.${catalogSlug(value)}`;
}

/** The translated catalog entry, or the English presentation when no table has it. */
export function translateCatalog(t: Translator['t'], kind: CatalogKind, value: string, fallback: string): string {
  const key = catalogKey(kind, value);
  const translated = t(key);
  return translated === key ? fallback : translated;
}
