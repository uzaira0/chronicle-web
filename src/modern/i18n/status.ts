import { catalogSlug } from './catalog';
import type { Translator } from './translator';

/**
 * Translatable presentation for the server enums the dashboard renders verbatim
 * (participation status, export-job status, session/runtime state). The wire value stays
 * the source of truth — nothing here is ever sent back — and an unrecognised value falls
 * back to the humanised enum, exactly what these call sites rendered before.
 */
export type StatusGroup = 'auth_mode' | 'backend' | 'job' | 'participation' | 'session';

export function statusLabel(t: Translator['t'], group: StatusGroup, value: string): string {
  const key = `status.${group}.${catalogSlug(value)}`;
  const translated = t(key);
  return translated === key ? value.replace(/[_-]/g, ' ') : translated;
}
