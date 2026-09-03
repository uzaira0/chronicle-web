// Language-code model for the Time Use Diary, ported faithfully from upstream
// `methodic-labs/chronicle-web`: `src/core/i18n/GenderedLanguages.js` +
// `src/common/constants/objects.js` +
// `src/containers/tud/constants/{SupportedLanguages,ArrayOrderPermutations}.js`.
//
// Hebrew is a *gendered* language: the picker offers a single base code "he", and
// the participant's grammatical gender (from the `?gender=` query param) selects
// the he-male or he-female translation table. Other languages are ungendered.

// Dev-only pseudo-locale (the Android/Chrome `en-XA` convention): English with every letter
// of the *template* accented, reached via `?lang=en-XA`. Anything still plain on screen is
// hardcoded, or came from the server. Never offered in the picker.
export const PSEUDO_LOCALE = 'en-XA';

export const LanguageCodes = Object.freeze({
  ENGLISH: 'en',
  GERMAN: 'de',
  SPANISH: 'es',
  SWEDISH: 'sv',
  HEBREW_MALE: 'he-male',
  HEBREW_FEMALE: 'he-female',
} as const);

// base code -> gendered variant tables
const GENDERED_LANGUAGES: Record<string, { male: string; female: string }> = {
  he: { male: LanguageCodes.HEBREW_MALE, female: LanguageCodes.HEBREW_FEMALE },
};

// The language picker shown to participants. `code` is the *base* code (what goes
// in `?lang=`); gendered bases resolve to a concrete table at load time.
export interface SupportedLanguage {
  language: string;
  code: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = Object.freeze([
  { code: 'en', language: 'English' },
  { code: 'de', language: 'German' },
  { code: 'he', language: 'עברית' }, // עברית
  { code: 'sv', language: 'Swedish' },
  { code: 'es', language: 'Spanish' },
]);

// Base codes accepted in `?lang=` (the part before any region/gender subtag).
export const SUPPORTED_BASE_CODES: ReadonlySet<string> = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

/**
 * Resolve a base language code + optional gender to a concrete translation-table
 * code. Ungendered bases pass through unchanged; gendered bases default to male
 * when gender is absent or unrecognized (matches upstream).
 */
export function resolveLanguageCode(baseCode: string, gender?: string | null): string {
  const config = GENDERED_LANGUAGES[baseCode];
  if (!config) return baseCode;
  if (gender === 'female') return config.female;
  if (gender === 'male') return config.male;
  return config.male;
}

/** Inverse of resolveLanguageCode: he-male/he-female -> "he"; others unchanged. */
export function getBaseLanguageCode(effectiveCode: string): string {
  for (const [base, variants] of Object.entries(GENDERED_LANGUAGES)) {
    if (variants.male === effectiveCode || variants.female === effectiveCode) {
      return base;
    }
  }
  return effectiveCode;
}

export function isGenderedLanguage(baseCode: string): boolean {
  return baseCode in GENDERED_LANGUAGES;
}

/** Hebrew renders right-to-left; everything else left-to-right. */
export function isRtlLanguage(effectiveCode: string): boolean {
  return getBaseLanguageCode(effectiveCode) === 'he';
}

/*
 * Some languages order array-type translation values differently from English.
 * permutation[selectedIndex] = englishIndex. Hebrew weekday_options are Sunday-first
 * while English is Monday-first, so selected index 0 (Sunday) maps to English index 6.
 * Used only for back-translation at submit time, never for display order.
 */
export const ARRAY_ORDER_PERMUTATIONS: Record<string, Record<string, number[]>> = {
  [LanguageCodes.HEBREW_MALE]: { weekday_options: [6, 0, 1, 2, 3, 4, 5] },
  [LanguageCodes.HEBREW_FEMALE]: { weekday_options: [6, 0, 1, 2, 3, 4, 5] },
};
