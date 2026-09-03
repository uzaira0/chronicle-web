import { SUPPORTED_BASE_CODES } from '@/i18n/language-codes';
import type { TudSettings } from './tud-flow';

/**
 * Structural shape of the study's configured Time Use Diary settings, as returned by the
 * participant-readable backend `GET /time-use-diary/{studyId}/settings`. Kept local (structural)
 * so this pure resolver does not depend on the RTK slice.
 */
export type TudStudySettings = {
  clockFormat: number;
  clockFormatLocked: boolean;
  enableChangesForOhioStateUniversity: boolean;
  enableChangesForSherbrookeUniversity: boolean;
  language: string;
};

function parseClockFormat(raw: string | null): 12 | 24 | undefined {
  if (raw === '12') return 12;
  if (raw === '24') return 24;
  return undefined;
}

function boolParam(params: URLSearchParams, key: string): boolean {
  const raw = params.get(key);
  return raw === 'true' || raw === '1';
}

/**
 * Resolve the diary's variant settings. The study's *configured* settings are authoritative
 * (matching upstream methodic-labs, which reads these from study settings); a URL query param
 * overrides a given flag only when it is explicitly present — real participant links carry none
 * of them, so the override is a manual/testing affordance, not the primary path. When `settings`
 * is absent (not yet loaded, or the fetch failed) this degrades to the URL params / upstream
 * defaults so the diary still renders rather than locking the participant out.
 */
export function resolveTudSettings(params: URLSearchParams, settings: TudStudySettings | undefined): TudSettings {
  const has = (key: string) => params.get(key) !== null;
  return {
    clockFormat: parseClockFormat(params.get('clockFormat')) ?? (settings?.clockFormat === 24 ? 24 : 12),
    clockFormatLocked: has('lockClockFormat')
      ? boolParam(params, 'lockClockFormat')
      : (settings?.clockFormatLocked ?? false),
    enableOsu: has('osu') ? boolParam(params, 'osu') : (settings?.enableChangesForOhioStateUniversity ?? false),
    enableSherbrooke: has('sherbrooke')
      ? boolParam(params, 'sherbrooke')
      : (settings?.enableChangesForSherbrookeUniversity ?? false),
  };
}

/**
 * The base language code for the diary: an explicit `?lang=` wins, else the study's configured
 * `language`, else `en`. Unsupported codes fall back to `en`. (Gender is a `?gender=`-only
 * override applied later via `resolveLanguageCode`.)
 */
export function resolveBaseLang(params: URLSearchParams, settings: TudStudySettings | undefined): string {
  const candidate = params.get('lang') ?? settings?.language ?? 'en';
  return SUPPORTED_BASE_CODES.has(candidate) ? candidate : 'en';
}
