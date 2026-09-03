// The Time Use Diary participant form is a localized clinical instrument. These
// six translation tables are the verbatim wording source-of-truth, all ported from
// upstream `methodic-labs/chronicle-web` (`src/core/i18n` there). They are co-located
// with the TUD feature so it is self-contained and does not depend on the i18next
// runtime, which this app does not bundle — these tables and ./translator.ts are the
// whole translation system, and the only translated surface is the participant diary.
import de from './de/translation.json';
import en from './en/translation.json';
import es from './es/translation.json';
import heFemale from './he-female/translation.json';
import heMale from './he-male/translation.json';
import sv from './sv/translation.json';

export type TranslationTable = Record<string, unknown>;

// Effective (resolved) language code -> its translation table. "he" is never a key
// here; it always resolves to he-male / he-female via resolveLanguageCode().
export const TRANSLATION_TABLES: Record<string, TranslationTable> = {
  de,
  en,
  es,
  sv,
  'he-female': heFemale,
  'he-male': heMale,
};
